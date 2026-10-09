import asyncio
import json
import logging
import os
from dataclasses import dataclass, field

from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.scenes.v1 import scenes_pb2

from src.config import settings
from src.db.chroma_db import ChromaDatabaseManager, visual_metadata
from src.decorators.cpu_manager import run_cpu
from src.events import StageProgress, report_stage
from src.services.LLMService import LLMService
from src.services.media_indexer import describe_image, search_text, workdir
from src.services.S3ClientService import S3ClientService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.utils.deletion_tracker import is_deleted

logger = logging.getLogger(__name__)

INDEXING = common_pb2.PROCESSING_STAGE_INDEXING
SCENE_RETRY_DELAYS = [1, 3]
EMPTY_REGISTRY = {"characters": [], "story_context": ""}


def match_transcript(start: float, end: float, segments: list[dict]) -> str | None:
    """Joins every segment overlapping [start, end]; a sentence spanning a cut belongs to both scenes."""
    matched = [s for s in segments if s.get("start_time", 0) <= end and s.get("end_time", 0) >= start]
    joined = " ".join(s["text"] for s in matched if s.get("text", "").strip()).strip()
    return joined or None


@dataclass
class _Run:
    file: files_pb2.File
    segments: list[dict]
    registry: dict
    directory: str
    progress: StageProgress
    total: int
    done: int = 0
    failed: int = 0
    described: int = 0
    attempted: int = 0
    abort: asyncio.Event = field(default_factory=asyncio.Event)
    slots: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(settings.max_concurrent_scenes))


async def index_scenes(file: files_pb2.File, scenes: list[scenes_pb2.Scene]) -> None:
    chroma = ChromaDatabaseManager()
    if not scenes:
        await _finish(file, 0)
        return

    chroma.delete_scene_embeddings(file.id)
    segments = chroma.audio_segments(file.id)
    transcript = " ".join(s["text"] for s in segments if s["text"].strip())
    registry = await _character_registry(file, transcript)

    with workdir(file.id) as directory:
        run = _Run(file, segments, registry, directory, StageProgress(file.id, file.user_id, INDEXING), len(scenes))
        await run.progress.update(0)
        results = await asyncio.gather(*(_index_scene(run, scene) for scene in scenes))

    if run.abort.is_set():
        raise RuntimeError(f"Scene indexing aborted: {run.failed}/{run.total} scenes failed")
    if settings.nvidia_api_key and run.attempted and not run.described:
        raise RuntimeError(f"Vision model unavailable: all {run.attempted} scene descriptions failed")

    visual_items = [visual for visual, _ in filter(None, results)]
    text_items = [text for _, text in filter(None, results) if text]
    await _narrative(file, transcript, registry, visual_items)

    if is_deleted(file.id, file.user_id):
        return
    chroma.upsert_items(chroma.image_index_name, visual_items)
    chroma.upsert_items(chroma.text_index_name, text_items)
    await _finish(file, len(visual_items))


async def _finish(file: files_pb2.File, indexed: int) -> None:
    await report_stage(
        file.id,
        file.user_id,
        stage=common_pb2.PROCESSING_STAGE_COMPLETED,
        status=common_pb2.PROCESSING_STATUS_COMPLETED,
        attributes={"scenesIndexed": indexed},
    )


async def _index_scene(run: _Run, scene: scenes_pb2.Scene) -> tuple[dict, dict | None] | None:
    if run.abort.is_set():
        return None
    async with run.slots:
        if not scene.thumbnail_key:
            await _tick(run)
            return None
        for attempt in range(settings.max_scene_retries + 1):
            if run.abort.is_set():
                return None
            try:
                items = await _embed_scene(run, scene)
                await _tick(run)
                return items
            except FileNotFoundError as error:
                logger.error("Scene %d thumbnail missing: %s", scene.scene_number, error)
                break
            except Exception as error:
                if attempt == settings.max_scene_retries:
                    logger.error("Scene %d failed after %d attempts: %s", scene.scene_number, attempt + 1, error)
                    break
                await asyncio.sleep(SCENE_RETRY_DELAYS[min(attempt, len(SCENE_RETRY_DELAYS) - 1)])

        run.failed += 1
        if (
            run.failed / run.total > settings.scene_failure_threshold_ratio
            or run.failed >= settings.scene_failure_threshold_count
        ):
            run.abort.set()
        await _tick(run)
        return None


async def _embed_scene(run: _Run, scene: scenes_pb2.Scene) -> tuple[dict, dict | None]:
    embedder = VideoEmbedderService()
    path = os.path.join(run.directory, f"scene_{scene.scene_number}.jpg")
    await S3ClientService().download(settings.aws_s3_bucket, scene.thumbnail_key, path)
    image_vector = await run_cpu(embedder.embed_image, path)
    if image_vector is None:
        raise RuntimeError("Scene embedding failed")
    ocr_text = await run_cpu(embedder.extract_text, path) or ""
    transcript = match_transcript(scene.start_seconds, scene.end_seconds, run.segments)

    description = None
    if settings.nvidia_api_key:
        run.attempted += 1
        try:
            description = await describe_image(
                path,
                transcript=transcript,
                character_registry=run.registry,
                scene_index=scene.scene_number - 1,
                start_time=scene.start_seconds,
                end_time=scene.end_seconds,
                story_context=run.registry.get("story_context", ""),
            )
            run.described += 1
        except Exception as error:
            logger.warning("Scene %d description failed: %s", scene.scene_number, error)

    text = search_text(description.summary if description else None, transcript, ocr_text)
    text_vector = await run_cpu(embedder.embed_text, text) if text else None
    record = {
        "file_id": run.file.id,
        "user_id": run.file.user_id,
        "file_type": "VIDEO",
        "file_name": run.file.name,
        "scene_id": scene.id,
        "scene_index": scene.scene_number - 1,
        "scene_number": scene.scene_number,
        "start_frame": scene.start_frame,
        "end_frame": scene.end_frame,
        "start_time": scene.start_seconds,
        "end_time": scene.end_seconds,
        "keyframe": scene.keyframe,
        "thumbnail_s3_key": scene.thumbnail_key,
        "text": text,
        "ocr_text": ocr_text,
        "transcript": transcript or "",
        **visual_metadata(description),
    }
    chunk = f"{run.file.id}#scene_{scene.scene_number - 1}"
    visual = {**record, "chunk_id": chunk, "vector": image_vector}
    text_item = {**record, "chunk_id": f"{chunk}#text", "vector": text_vector} if text_vector is not None else None
    return visual, text_item


async def _tick(run: _Run) -> None:
    run.done += 1
    await run.progress.update(100 * run.done / run.total)


async def _character_registry(file: files_pb2.File, transcript: str) -> dict:
    if not settings.nvidia_api_key or len(transcript.split()) < 30:
        return EMPTY_REGISTRY
    try:
        registry = await asyncio.wait_for(LLMService().extract_character_registry(transcript), timeout=90.0)
    except Exception as error:
        logger.warning("Character registry extraction failed for %s: %s", file.id, error)
        return EMPTY_REGISTRY
    registry = registry or EMPTY_REGISTRY
    text = json.dumps(registry)
    vector = await run_cpu(VideoEmbedderService().embed_text, text)
    if vector is not None:
        chroma = ChromaDatabaseManager()
        chroma.upsert_items(
            chroma.text_index_name,
            [
                {
                    "chunk_id": f"{file.id}#character_registry",
                    "file_id": file.id,
                    "user_id": file.user_id,
                    "content_type": "character_registry",
                    "vector": vector,
                    "text": text,
                }
            ],
        )
    return registry


async def _narrative(file: files_pb2.File, transcript: str, registry: dict, visual_items: list[dict]) -> None:
    summaries = [
        {
            "scene": item["scene_number"],
            "time": f"{item['start_time']:.1f}s-{item['end_time']:.1f}s",
            "description": item["description_summary"],
            "transcript": item.get("transcript", ""),
        }
        for item in sorted(visual_items, key=lambda i: i["scene_number"])
        if item.get("description_summary")
    ]
    if not settings.nvidia_api_key or not summaries:
        return
    try:
        narrative = await asyncio.wait_for(
            LLMService().generate_narrative_summary(
                full_transcript=transcript, scene_summaries=summaries, character_registry=registry
            ),
            timeout=120.0,
        )
    except Exception as error:
        logger.warning("Narrative summary failed for %s: %s", file.id, error)
        return
    if not narrative:
        return
    themes = narrative.get("themes") or []
    text = " ".join(
        filter(None, [narrative.get("summary", ""), narrative.get("story_arc", ""), f"Themes: {', '.join(themes)}" if themes else ""])
    )
    vector = await run_cpu(VideoEmbedderService().embed_text, text)
    if vector is None or is_deleted(file.id, file.user_id):
        return
    chroma = ChromaDatabaseManager()
    chroma.upsert_items(
        chroma.text_index_name,
        [
            {
                "chunk_id": f"{file.id}#narrative",
                "file_id": file.id,
                "user_id": file.user_id,
                "content_type": "narrative",
                "vector": vector,
                "text": text,
                "narrative_json": json.dumps(narrative),
            }
        ],
    )

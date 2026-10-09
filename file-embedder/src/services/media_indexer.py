import asyncio
import logging
import os
import shutil
import tempfile
from contextlib import contextmanager
from typing import Any, Iterator

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.config import settings
from src.db.chroma_db import ChromaDatabaseManager, visual_metadata
from src.decorators.cpu_manager import run_cpu
from src.events import StageProgress, report_stage
from src.services.LLMService import ImageDescription
from src.services.S3ClientService import S3ClientService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.YouTubeDownloaderService import YouTubeDownloaderService
from src.utils.deletion_tracker import is_deleted
from src.utils.file_utils import extract_audio, has_audio_stream

logger = logging.getLogger(__name__)

EMBEDDING = common_pb2.PROCESSING_STAGE_EMBEDDING
VIDEO_TYPES = (common_pb2.FILE_TYPE_VIDEO, common_pb2.FILE_TYPE_YOUTUBE_VIDEO)


async def index_upload(upload: events_pb2.FileUploaded) -> None:
    if upload.type == common_pb2.FILE_TYPE_IMAGE:
        await _index_image(upload)
    elif upload.type == common_pb2.FILE_TYPE_AUDIO:
        await _transcribe(upload, is_video=False)
    elif upload.type in VIDEO_TYPES:
        await _transcribe(upload, is_video=True)
    else:
        await complete(upload.file_id, upload.user_id)


async def complete(file_id: str, user_id: str) -> None:
    await report_stage(
        file_id,
        user_id,
        stage=common_pb2.PROCESSING_STAGE_COMPLETED,
        status=common_pb2.PROCESSING_STATUS_COMPLETED,
    )


async def describe_image(path: str, **context: Any) -> ImageDescription | None:
    if not settings.nvidia_api_key:
        return None
    try:
        description = await asyncio.wait_for(
            VideoEmbedderService().generate_image_description(path, **context),
            timeout=settings.llm_request_timeout * 3 + 30,
        )
    except asyncio.TimeoutError as error:
        raise RuntimeError("Vision model timed out") from error
    if description is None:
        raise RuntimeError("Vision model returned no description")
    return description


def search_text(*parts: str | None) -> str:
    return " | ".join(part.strip() for part in parts if part and part.strip())


@contextmanager
def workdir(file_id: str) -> Iterator[str]:
    os.makedirs(settings.temp_dir, exist_ok=True)
    path = tempfile.mkdtemp(prefix=f"{file_id}-", dir=settings.temp_dir)
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def _local_name(upload: events_pb2.FileUploaded) -> str:
    return os.path.basename(upload.key) or f"{upload.file_id}.bin"


async def _index_image(upload: events_pb2.FileUploaded) -> None:
    embedder = VideoEmbedderService()
    progress = StageProgress(upload.file_id, upload.user_id, EMBEDDING)
    with workdir(upload.file_id) as directory:
        path = await S3ClientService().download(upload.bucket, upload.key, os.path.join(directory, _local_name(upload)))
        await progress.update(10)
        image_vector = await run_cpu(embedder.embed_image, path)
        if image_vector is None:
            raise RuntimeError("Image embedding failed")
        ocr_text = await run_cpu(embedder.extract_text, path) or ""
        await progress.update(40)
        description = await describe_image(path)
        await progress.update(80)
        text = search_text(description.summary if description else None, ocr_text)
        text_vector = await run_cpu(embedder.embed_text, text) if text else None

    if is_deleted(upload.file_id, upload.user_id):
        return
    record = {
        "file_id": upload.file_id,
        "user_id": upload.user_id,
        "file_type": "IMAGE",
        "file_name": upload.name,
        "text": text,
        "ocr_text": ocr_text,
        **visual_metadata(description),
    }
    chroma = ChromaDatabaseManager()
    chroma.upsert_items(chroma.image_index_name, [{**record, "chunk_id": f"{upload.file_id}#image#0", "vector": image_vector}])
    if text_vector is not None:
        chroma.upsert_items(chroma.text_index_name, [{**record, "chunk_id": f"{upload.file_id}#image#1", "vector": text_vector}])
    await complete(upload.file_id, upload.user_id)


async def _transcribe(upload: events_pb2.FileUploaded, is_video: bool) -> None:
    embedder = VideoEmbedderService()
    progress = StageProgress(upload.file_id, upload.user_id, EMBEDDING)
    with workdir(upload.file_id) as directory:
        source = os.path.join(directory, _local_name(upload))
        if upload.HasField("youtube_url"):
            source = os.path.join(directory, f"{upload.file_id}.mp4")
            await YouTubeDownloaderService().download_video(upload.youtube_url, source)
        else:
            await S3ClientService().download(upload.bucket, upload.key, source)
        await progress.update(10)

        segments: list[dict] = []
        if await run_cpu(has_audio_stream, source):
            audio_path = source
            if is_video:
                audio_path = await run_cpu(extract_audio, source, os.path.join(directory, "audio.mp3"))
            transcription = await run_cpu(embedder.transcribe_audio, audio_path)
            if transcription is None:
                raise RuntimeError("Transcription failed")
            segments = transcription["segments"]
        await progress.update(50)

        items = []
        for index, segment in enumerate(segments):
            vector = await run_cpu(embedder.embed_text, segment["text"])
            if vector is not None:
                items.append(
                    {
                        "chunk_id": f"{upload.file_id}#audio#{index}",
                        "segment_index": index,
                        "file_id": upload.file_id,
                        "user_id": upload.user_id,
                        "file_type": "VIDEO" if is_video else "AUDIO",
                        "file_name": upload.name,
                        "vector": vector,
                        "start_time": segment["start"],
                        "end_time": segment["end"],
                        "text": segment["text"],
                    }
                )
            if (index + 1) % settings.audio_segment_batch_size == 0:
                await progress.update(50 + 50 * (index + 1) / len(segments))

    if is_deleted(upload.file_id, upload.user_id):
        return
    chroma = ChromaDatabaseManager()
    chroma.delete_audio_segments(upload.file_id)
    chroma.upsert_items(chroma.text_index_name, items)
    logger.info("Indexed %d transcript segments for %s", len(items), upload.file_id)
    if is_video:
        await progress.update(100)
    else:
        await complete(upload.file_id, upload.user_id)

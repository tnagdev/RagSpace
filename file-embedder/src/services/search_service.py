import asyncio
from dataclasses import dataclass
from typing import Any

import numpy as np
from ragspace.common.v1 import common_pb2
from ragspace.scenes.v1 import scenes_pb2

from src.clients import batch_get_files, batch_get_scenes, scene_at
from src.db.chroma_db import ChromaDatabaseManager, parse_visual
from src.decorators.cpu_manager import run_cpu
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.media_indexer import VIDEO_TYPES
from src.utils.query_utils import expand_query

STORED_TYPES = {
    common_pb2.FILE_TYPE_VIDEO: "VIDEO",
    common_pb2.FILE_TYPE_YOUTUBE_VIDEO: "VIDEO",
    common_pb2.FILE_TYPE_IMAGE: "IMAGE",
    common_pb2.FILE_TYPE_AUDIO: "AUDIO",
}


@dataclass
class SearchOptions:
    limit: int = 10
    text_weight: float = 0.5
    image_weight: float = 0.5
    threshold: float = 0.2
    dynamic_retrieval: bool = True
    query_expansion: bool = True


async def search(
    user_id: str, query: str, file_ids: list[str], file_types: list[int], options: SearchOptions
) -> list[common_pb2.SearchHit]:
    stored_types = sorted({STORED_TYPES[t] for t in file_types if t in STORED_TYPES})
    if file_types and not stored_types:
        return []
    where = _where(user_id, file_ids, stored_types)
    results = await run_cpu(_retrieve, query, where, options)

    files = await batch_get_files(user_id, list(dict.fromkeys(r["file_id"] for r in results)), include_urls=True)
    results = [r for r in results if r["file_id"] in files and (not file_types or files[r["file_id"]].type in file_types)]
    scenes = await _resolve_scenes(user_id, results, files)
    return [_to_hit(result, files[result["file_id"]], scenes[index]) for index, result in enumerate(results)]


def _where(user_id: str, file_ids: list[str], stored_types: list[str]) -> dict[str, Any]:
    conditions: list[dict[str, Any]] = [{"user_id": user_id}]
    if file_ids:
        conditions.append({"file_id": {"$in": file_ids}})
    if stored_types:
        conditions.append({"file_type": {"$in": stored_types}})
    return conditions[0] if len(conditions) == 1 else {"$and": conditions}


def _retrieve(query: str, where: dict[str, Any], options: SearchOptions) -> list[dict[str, Any]]:
    embedder = ImageEmbedderService()
    queries = (expand_query(query, max_keywords=5) if options.query_expansion else None) or [query]
    vectors = [v for v in (embedder.embed_text(q) for q in queries) if v is not None]
    text_vector = None
    if vectors:
        mean = np.mean(np.array(vectors), axis=0)
        text_vector = mean / np.linalg.norm(mean)
    image_vector = embedder.embed_text_with_clip(query)
    return ChromaDatabaseManager().query_index(
        text_query_vec=text_vector,
        image_query_vec=image_vector,
        filters=where,
        options={
            "top_k": options.limit,
            "text_weight": options.text_weight,
            "image_weight": options.image_weight,
            "threshold": options.threshold,
            "use_dynamic_retrieval": options.dynamic_retrieval,
        },
    )


async def _resolve_scenes(user_id: str, results: list[dict], files: dict) -> list[scenes_pb2.Scene | None]:
    """Finds each video hit's scene: by stored scene_id, else the scene containing the hit's midpoint."""
    by_id = await batch_get_scenes(user_id, list({r["scene_id"] for r in results if r.get("scene_id")}), include_urls=True)

    async def resolve(result: dict) -> scenes_pb2.Scene | None:
        if files[result["file_id"]].type not in VIDEO_TYPES:
            return None
        if result.get("scene_id"):
            return by_id.get(result["scene_id"])
        start, end = result.get("start_time"), result.get("end_time")
        if start is None or end is None:
            return None
        return await scene_at(user_id, result["file_id"], (start + end) / 2, include_urls=True)

    return list(await asyncio.gather(*(resolve(r) for r in results)))


def _to_hit(result: dict, file, scene: scenes_pb2.Scene | None) -> common_pb2.SearchHit:
    is_scene = result.get("scene_index") is not None
    hit = common_pb2.SearchHit(
        file_id=file.id,
        file_name=file.name,
        file_type=file.type,
        score=float(result.get("score", 0.0)),
        text_score=float(result.get("text_score", 0.0)),
        image_score=float(result.get("image_score", 0.0)),
    )
    if result.get("segment_index") is not None:
        hit.segment_index = int(result["segment_index"])
    if result.get("start_time") is not None:
        hit.start_seconds = float(result["start_time"])
    if result.get("end_time") is not None:
        hit.end_seconds = float(result["end_time"])
    snippet = result.get("transcript") if is_scene else result.get("text")
    if snippet:
        hit.snippet = snippet
    if scene is not None:
        hit.scene_id = scene.id
        hit.scene_number = scene.scene_number
    elif is_scene:
        hit.scene_number = int(result["scene_index"]) + 1
    thumbnail = scene.thumbnail_url if scene is not None and scene.HasField("thumbnail_url") else None
    if thumbnail or file.HasField("thumbnail_url"):
        hit.thumbnail_url = thumbnail or file.thumbnail_url
    if file.HasField("download_url"):
        hit.file_url = file.download_url
    if file.HasField("youtube_url"):
        hit.youtube_url = file.youtube_url
    visual = parse_visual(result)
    if visual:
        hit.visual.CopyFrom(to_visual(visual))
    return hit


def to_visual(visual: dict) -> common_pb2.VisualDescription:
    message = common_pb2.VisualDescription(objects=visual["objects"], colors=visual["colors"])
    for key in ("summary", "setting", "style"):
        if visual.get(key):
            setattr(message, key, visual[key])
    return message

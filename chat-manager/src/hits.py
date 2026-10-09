from typing import Any

from google.protobuf import json_format
from ragspace.common.v1 import common_pb2

from src.clients import batch_get_files, batch_get_scenes

# Signed URLs expire, so stored hits omit them and hydrate() re-signs on read.
_URL_FIELDS = ("thumbnail_url", "file_url")
_LEGACY_KEYS = ("text_content", "start_time", "thumbnail_s3_key", "file_s3_key")


def to_stored(hits: list[common_pb2.SearchHit]) -> list[dict[str, Any]]:
    stored = []
    for hit in hits:
        data = json_format.MessageToDict(hit, preserving_proto_field_name=True)
        for field in _URL_FIELDS:
            data.pop(field, None)
        stored.append(data)
    return stored


def from_stored(value: Any) -> list[common_pb2.SearchHit]:
    if not isinstance(value, list):
        return []
    hits = []
    for item in value:
        if not isinstance(item, dict):
            continue
        if any(key in item for key in _LEGACY_KEYS):
            hits.append(_from_legacy(item))
            continue
        try:
            hits.append(json_format.ParseDict(item, common_pb2.SearchHit(), ignore_unknown_fields=True))
        except json_format.ParseError:
            hits.append(_from_legacy(item))
    return hits


def _from_legacy(item: dict[str, Any]) -> common_pb2.SearchHit:
    hit = common_pb2.SearchHit(
        file_id=item.get("file_id") or "", file_name=item.get("file_name") or "", score=float(item.get("score") or 0)
    )
    file_type = "FILE_TYPE_" + (item.get("file_type") or "").upper()
    if file_type in common_pb2.FileType.keys():
        hit.file_type = common_pb2.FileType.Value(file_type)
    for source, target in (("scene_id", "scene_id"), ("youtube_url", "youtube_url"), ("text_content", "snippet")):
        if item.get(source):
            setattr(hit, target, item[source])
    for source, target in (("start_time", "start_seconds"), ("end_time", "end_seconds")):
        if item.get(source) is not None:
            setattr(hit, target, float(item[source]))
    if item.get("description"):
        hit.visual.summary = item["description"]
    return hit


async def hydrate(user_id: str, hits: list[common_pb2.SearchHit]) -> None:
    if not hits:
        return
    files = await batch_get_files(user_id, [h.file_id for h in hits if h.file_id], include_urls=True)
    scenes = await batch_get_scenes(user_id, [h.scene_id for h in hits if h.HasField("scene_id")])
    for hit in hits:
        file = files.get(hit.file_id)
        scene = scenes.get(hit.scene_id) if hit.HasField("scene_id") else None
        if file is not None and file.HasField("download_url"):
            hit.file_url = file.download_url
        if scene is not None and scene.HasField("thumbnail_url"):
            hit.thumbnail_url = scene.thumbnail_url
        elif file is not None and file.HasField("thumbnail_url"):
            hit.thumbnail_url = file.thumbnail_url

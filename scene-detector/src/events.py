from typing import Any

from ragspace.events.v1 import events_pb2
from ragspace_shared.events import EventBus
from ragspace_shared.protos import to_struct

from src.config.settings import settings

event_bus = EventBus(settings.rabbitmq_url, "scene-detector")


async def report_stage(
    file_id: str,
    user_id: str,
    *,
    stage: int = 0,
    status: int = 0,
    retry_count: int = 0,
    progress: int | None = None,
    error: str | None = None,
    thumbnail_key: str | None = None,
    attributes: dict[str, Any] | None = None,
    name: str | None = None,
    size_bytes: int | None = None,
) -> None:
    change = events_pb2.FileStageChanged(
        file_id=file_id, user_id=user_id, stage=stage, status=status, retry_count=retry_count
    )
    if progress is not None:
        change.progress_percent = progress
    if error:
        change.error_message = error[:1000]
    if thumbnail_key:
        change.thumbnail_key = thumbnail_key
    if attributes:
        change.attributes.CopyFrom(to_struct(attributes))
    if name:
        change.name = name
    if size_bytes:
        change.size_bytes = size_bytes
    await event_bus.publish("file_stage_changed", change)

import logging
from typing import Any

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2
from ragspace_shared.events import EventBus
from ragspace_shared.protos import to_struct

from src.config import settings

logger = logging.getLogger(__name__)

event_bus = EventBus(settings.rabbitmq_url, "file-embedder")


async def report_stage(
    file_id: str,
    user_id: str,
    *,
    stage: int,
    status: int,
    retry_count: int = 0,
    progress: int | None = None,
    error: str | None = None,
    attributes: dict[str, Any] | None = None,
) -> None:
    change = events_pb2.FileStageChanged(
        file_id=file_id, user_id=user_id, stage=stage, status=status, retry_count=retry_count
    )
    if progress is not None:
        change.progress_percent = progress
    if error:
        change.error_message = error[:1000]
    if attributes:
        change.attributes.CopyFrom(to_struct(attributes))
    await event_bus.publish("file_stage_changed", change)


class StageProgress:
    """Throttles progress reports to one per `step` percent."""

    def __init__(self, file_id: str, user_id: str, stage: int, step: int = 5) -> None:
        self.file_id = file_id
        self.user_id = user_id
        self.stage = stage
        self.step = step
        self._last = -step

    async def update(self, percent: float) -> None:
        value = max(0, min(100, int(percent)))
        if value - self._last < self.step and value != 100:
            return
        self._last = value
        try:
            await report_stage(
                self.file_id, self.user_id, stage=self.stage, status=common_pb2.PROCESSING_STATUS_IN_PROGRESS, progress=value
            )
        except Exception as error:
            logger.warning("Progress report for %s failed: %s", self.file_id, error)

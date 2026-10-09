import asyncio
import logging

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.clients import file_exists
from src.config.settings import settings
from src.events import report_stage
from src.services import scene_repository
from src.services.scene_processor import SceneProcessor
from src.utils.background_tasks import background_task_manager

logger = logging.getLogger(__name__)

RETRY_BACKOFF_SECONDS = [5, 15, 45]


async def handle_event(envelope: events_pb2.Envelope) -> None:
    kind = envelope.WhichOneof("payload")
    if kind == "file_uploaded":
        upload = envelope.file_uploaded
        background_task_manager.create_task(_process(upload), name=f"process-{upload.file_id}", file_id=upload.file_id)
    elif kind == "file_deleted":
        file_id = envelope.file_deleted.file_id
        background_task_manager.cancel_file_tasks(file_id)
        removed = await scene_repository.delete_for_files([file_id])
        logger.info("Removed %d scenes for deleted file %s", removed, file_id)
    elif kind == "user_deleted":
        removed = await scene_repository.delete_for_user(envelope.user_deleted.user_id)
        logger.info("Removed %d scenes for deleted user %s", removed, envelope.user_deleted.user_id)


async def _process(upload: events_pb2.FileUploaded) -> None:
    if not await file_exists(upload.user_id, upload.file_id):
        logger.info("File %s no longer exists; skipping", upload.file_id)
        return
    attempts = settings.max_processing_retries
    for attempt in range(1, attempts + 1):
        try:
            await SceneProcessor().process(upload, is_final_attempt=attempt == attempts)
            return
        except asyncio.CancelledError:
            raise
        except Exception:
            if attempt == attempts or not await file_exists(upload.user_id, upload.file_id):
                return
            await report_stage(
                upload.file_id,
                upload.user_id,
                stage=common_pb2.PROCESSING_STAGE_SCENE_DETECTION,
                status=common_pb2.PROCESSING_STATUS_IN_PROGRESS,
                retry_count=attempt,
            )
            await asyncio.sleep(RETRY_BACKOFF_SECONDS[min(attempt - 1, len(RETRY_BACKOFF_SECONDS) - 1)])

import asyncio
import logging
from typing import Awaitable, Callable

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.clients import file_exists, get_file, list_scenes
from src.config import settings
from src.db.chroma_db import ChromaDatabaseManager
from src.decorators.cpu_manager import run_cpu
from src.events import report_stage
from src.services import media_indexer, scene_indexer
from src.services.media_indexer import VIDEO_TYPES
from src.utils.background_tasks import file_tasks
from src.utils.deletion_tracker import is_deleted, mark_files_deleted, mark_user_deleted

logger = logging.getLogger(__name__)

RETRY_BACKOFF_SECONDS = [5, 15, 45]
# Catches Chroma writes already running in the executor when their task was cancelled.
DEFERRED_PURGE_SECONDS = 10

processing_slots = asyncio.Semaphore(settings.max_concurrent_jobs)
_transcriptions: dict[str, asyncio.Task] = {}
_purges: set[asyncio.Task] = set()


async def handle_event(envelope: events_pb2.Envelope) -> None:
    kind = envelope.WhichOneof("payload")
    if kind == "file_uploaded":
        _start_upload(envelope.file_uploaded)
    elif kind == "file_scenes_detected":
        detected = envelope.file_scenes_detected
        file_tasks.start(detected.file_id, _index_scenes(detected), name=f"scenes-{detected.file_id}")
    elif kind == "file_deleted":
        await _purge_files(envelope.file_deleted.user_id, [envelope.file_deleted.file_id])
    elif kind == "user_deleted":
        user_id = envelope.user_deleted.user_id
        mark_user_deleted(user_id)
        await run_cpu(ChromaDatabaseManager().delete_by_user_id, user_id)
        logger.info("Removed embeddings for deleted user %s", user_id)


def _start_upload(upload: events_pb2.FileUploaded) -> None:
    task = file_tasks.start(upload.file_id, _index_upload(upload), name=f"index-{upload.file_id}")
    if upload.type in VIDEO_TYPES:
        _transcriptions[upload.file_id] = task
        task.add_done_callback(lambda done: _transcriptions.pop(upload.file_id, None) if _transcriptions.get(upload.file_id) is done else None)


async def _index_upload(upload: events_pb2.FileUploaded) -> bool:
    if not await file_exists(upload.user_id, upload.file_id):
        logger.info("File %s no longer exists; skipping", upload.file_id)
        return False
    async with processing_slots:
        return await _with_retries(
            upload.file_id,
            upload.user_id,
            common_pb2.PROCESSING_STAGE_EMBEDDING,
            lambda: media_indexer.index_upload(upload),
        )


async def _index_scenes(detected: events_pb2.FileScenesDetected) -> bool:
    transcription = _transcriptions.get(detected.file_id)
    if transcription is not None:
        await asyncio.wait({transcription}, timeout=settings.transcription_wait_seconds)
        if transcription.done() and (transcription.cancelled() or transcription.result() is False):
            return False

    file = await get_file(detected.user_id, detected.file_id)
    if file is None or file.processing_status == common_pb2.PROCESSING_STATUS_FAILED:
        return False
    scenes = await list_scenes(detected.user_id, [detected.file_id])
    async with processing_slots:
        return await _with_retries(
            file.id,
            file.user_id,
            common_pb2.PROCESSING_STAGE_INDEXING,
            lambda: scene_indexer.index_scenes(file, scenes),
        )


async def _with_retries(file_id: str, user_id: str, stage: int, work: Callable[[], Awaitable[None]]) -> bool:
    attempts = max(1, settings.max_processing_retries)
    for attempt in range(1, attempts + 1):
        try:
            await work()
            return True
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("Attempt %d/%d failed for %s", attempt, attempts, file_id)
            if is_deleted(file_id, user_id) or not await file_exists(user_id, file_id):
                return False
            if attempt == attempts:
                await report_stage(
                    file_id,
                    user_id,
                    stage=stage,
                    status=common_pb2.PROCESSING_STATUS_FAILED,
                    retry_count=attempt - 1,
                    error=str(error),
                )
                return False
            await report_stage(
                file_id, user_id, stage=stage, status=common_pb2.PROCESSING_STATUS_IN_PROGRESS, retry_count=attempt
            )
            await asyncio.sleep(RETRY_BACKOFF_SECONDS[min(attempt - 1, len(RETRY_BACKOFF_SECONDS) - 1)])
    return False


async def _purge_files(user_id: str, file_ids: list[str]) -> None:
    mark_files_deleted(file_ids)
    for file_id in file_ids:
        file_tasks.cancel(file_id)
        _transcriptions.pop(file_id, None)
    await run_cpu(ChromaDatabaseManager().delete_by_file_ids, file_ids)
    logger.info("Removed embeddings for %d deleted file(s) of user %s", len(file_ids), user_id)

    async def deferred() -> None:
        await asyncio.sleep(DEFERRED_PURGE_SECONDS)
        await run_cpu(ChromaDatabaseManager().delete_by_file_ids, file_ids)

    task = asyncio.create_task(deferred(), name=f"purge-{file_ids[0]}")
    _purges.add(task)
    task.add_done_callback(_purges.discard)

"""Handler for file deletion events - cleans up embeddings."""
import asyncio
import json
import logging
import httpx
from src.db.chroma_db import ChromaDatabaseManager
from src.models.events import FileDeletedEventModel
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.utils.background_tasks import background_task_manager
from src.utils.deletion_tracker import mark_deleted
from src.config import settings

logger = logging.getLogger(__name__)


async def _deferred_chroma_cleanup(file_ids: list[str]) -> None:
    """Re-clean ChromaDB 10s after cancellation to catch any in-executor writes."""
    await asyncio.sleep(10)
    try:
        chroma_db = ChromaDatabaseManager()
        chroma_db.delete_by_file_ids(file_ids)
        logger.info(f"Deferred ChromaDB cleanup complete for {len(file_ids)} file(s)")
    except Exception as e:
        logger.error(f"Deferred ChromaDB cleanup failed: {e}")


async def _delete_conversations(file_ids: list[str], user) -> None:
    try:
        user_dict = user if isinstance(user, dict) else user.model_dump()
        url = f"{settings.chat_manager_url}/conversations/batch/files/delete"
        async with httpx.AsyncClient(timeout=settings.chat_manager_timeout_seconds) as client:
            response = await client.post(
                url,
                headers={
                    'Content-Type': 'application/json',
                    'x-user': json.dumps(user_dict),
                    'x-service': 'file-embedder'
                },
                json={'file_ids': file_ids}
            )
            if response.is_success:
                result = response.json()
                logger.info(f"✓ Deleted {result.get('count', 0)} conversations for {len(file_ids)} file(s)")
            else:
                logger.warning(f"Failed to delete conversations: {response.status_code}")
    except Exception as e:
        logger.error(f"Error deleting conversations: {e}")


@rabbitmq_consumer.register_handler(FileEventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion — cancels in-flight tasks, cleans ChromaDB, removes conversations.

    Supports both single fileId and batch fileIds.
    """
    file_ids = event.fileIds or ([event.fileId] if event.fileId else [])
    if not file_ids:
        logger.error("No file IDs provided in deletion event")
        return

    logger.info(f"Processing deletion for {len(file_ids)} file(s): {file_ids}")

    # 1. Mark deleted — in-process guard for active background tasks
    for file_id in file_ids:
        mark_deleted(file_id)

    # 2. Cancel in-flight background tasks immediately
    total_cancelled = sum(background_task_manager.cancel_file_tasks(fid) for fid in file_ids)
    if total_cancelled:
        logger.info(f"Cancelled {total_cancelled} task(s) for {len(file_ids)} deleted file(s)")

    # 3. Clean ChromaDB immediately
    try:
        chroma_db = ChromaDatabaseManager()
        chroma_db.delete_by_file_ids(file_ids)
        logger.info(f"✓ ChromaDB cleanup complete for {len(file_ids)} file(s)")
    except Exception as e:
        logger.error(f"ChromaDB cleanup failed: {e}")

    # 4. Deferred cleanup — catches any writes that raced past task cancellation
    asyncio.create_task(
        _deferred_chroma_cleanup(file_ids),
        name=f"deferred-cleanup-{file_ids[0]}",
    )

    # 5. Clean conversations
    await _delete_conversations(file_ids, event.user)

import logging
import asyncio
import uuid
from src.models.enums import EventType
from src.models.events import UploadCompletedEventModel
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.services.scene_processor import SceneProcessor
from src.utils.background_tasks import background_task_manager
from src.utils.correlation import correlation_id_var

logger = logging.getLogger(__name__)


async def _process_file_in_background(event: UploadCompletedEventModel, correlation_id: str) -> None:
    """Background task for processing file without blocking the event handler.

    Args:
        event: Validated upload completion event
        correlation_id: Correlation ID for tracing this request
    """
    file_id = event.fileId
    user_id = event.user.id if event.user else None

    try:
        logger.info(f"[{correlation_id}] [Background] Processing file: {file_id} (user: {user_id})")
        scene_processor = SceneProcessor(event.user, None)
        await scene_processor.process_file(file_id, event)
        logger.info(f"[{correlation_id}] [Background] ✓ Successfully processed file: {file_id}")
    except Exception as e:
        logger.error(f"[{correlation_id}] [Background] Failed to process file {file_id}: {e}", exc_info=True)


@rabbitmq_consumer.register_handler(EventType.UPLOAD_COMPLETED)
async def handle_file_upload_completed(event: UploadCompletedEventModel) -> None:
    """Handle file upload completion event and trigger scene processing in background.

    This handler returns immediately after launching a background task to prevent
    blocking the RabbitMQ consumer and FastAPI event loop during heavy processing.

    Args:
        event: Validated upload completion event
    """
    correlation_id = str(uuid.uuid4())
    token = correlation_id_var.set(correlation_id)
    file_id = event.fileId
    try:
        if not file_id:
            raise ValueError("Missing fileId in event")

        if not event.user:
            raise ValueError("Missing user information in event")

        logger.info(f"[{correlation_id}] Received upload completed event for file: {file_id}")
        await _process_file_in_background(event, correlation_id)

    except ValueError as e:
        logger.error(f"[{correlation_id}] Validation error for file {file_id}: {e}")
    finally:
        correlation_id_var.reset(token)
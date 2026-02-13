import logging
import asyncio
from src.models.enums import EventType
from src.models.events import UploadCompletedEventModel
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.services.scene_processor import SceneProcessor
from src.utils.background_tasks import background_task_manager

logger = logging.getLogger(__name__)


async def _process_file_in_background(event: UploadCompletedEventModel) -> None:
    """Background task for processing file without blocking the event handler.
    
    Args:
        event: Validated upload completion event
    """
    file_id = event.fileId
    user_id = event.user.id if event.user else None
    
    try:
        logger.info(f"[Background] Processing file: {file_id} (user: {user_id})")
        scene_processor = SceneProcessor(event.user, None)
        await scene_processor.process_file(file_id, event)
        logger.info(f"[Background] ✓ Successfully processed file: {file_id}")
    except Exception as e:
        logger.error(f"[Background] Failed to process file {file_id}: {e}", exc_info=True)


@rabbitmq_consumer.register_handler(EventType.UPLOAD_COMPLETED)
async def handle_file_upload_completed(event: UploadCompletedEventModel) -> None:
    """Handle file upload completion event and trigger scene processing in background.
    
    This handler returns immediately after launching a background task to prevent
    blocking the RabbitMQ consumer and FastAPI event loop during heavy processing.
    
    Args:
        event: Validated upload completion event
    """
    file_id = event.fileId
    try:
        if not file_id:
            raise ValueError("Missing fileId in event")
        
        if not event.user:
            raise ValueError("Missing user information in event")
        
        await _process_file_in_background(event)
        
    except ValueError as e:
        logger.error(f"Validation error for file {file_id}: {e}")
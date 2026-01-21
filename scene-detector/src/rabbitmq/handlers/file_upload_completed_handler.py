import logging
from src.models.enums import EventType
from src.models.events import UploadCompletedEventModel
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.services.scene_processor import SceneProcessor

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(EventType.UPLOAD_COMPLETED)
async def handle_file_upload_completed(event: UploadCompletedEventModel) -> None:
    """Handle file upload completion event and trigger scene processing.
    
    Args:
        event: Validated upload completion event
    """
    file_id = event.fileId
    user_id = event.user.id if event.user else None
    
    try:
        logger.info(f"Processing upload completion for file: {file_id} (user: {user_id})")

        if not file_id:
            raise ValueError("Missing fileId in event")
        
        if not event.user:
            raise ValueError("Missing user information in event")
        
        scene_processor = SceneProcessor(event.user, None)
        await scene_processor.process_file(file_id, event)
        logger.info(f"✓ Successfully processed file: {file_id}")
    except ValueError as e:
        logger.error(f"Validation error for file {file_id}: {e}")
    except Exception as e:
        logger.error(f"Failed to process file {file_id}: {e}", exc_info=True)
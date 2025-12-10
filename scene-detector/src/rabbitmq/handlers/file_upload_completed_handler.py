import logging
from src.models.enums import EventType
from src.models.events import UploadCompletedEventModel
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.services.scene_processor import SceneProcessor


logger = logging.getLogger(__name__)

@rabbitmq_consumer.register_handler(EventType.UPLOAD_COMPLETED)
async def handle_file_upload_completed(event: UploadCompletedEventModel):
    try:
        scene_processor = SceneProcessor(event.user, None)
        file_id = event.fileId
        await scene_processor.process_file(file_id, event)
    except Exception as e:
        logger.error(f"Failed to handle file upload completed event: {e}", exc_info=True)
import logging
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.common.enums import EventType
from src.services.prisma_service import PrismaService
from src.models.events import FileDeletedEventModel

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(EventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion event by removing associated scenes.
    
    Args:
        event: Validated file deletion event
    """
    file_id = event.fileId
    try:
        logger.info(f"Processing file deletion: {file_id}")
        if not file_id:
            raise ValueError("Missing fileId in event")
        
        prisma_service = PrismaService()
        await prisma_service.ensure_connected()
        
        result = await prisma_service.prisma.scene.delete_many(
            where={"fileId": file_id}
        )
        scenes_deleted = result if isinstance(result, int) else 0
        logger.info(f"✓ Deleted {scenes_deleted} scenes for file: {file_id}")
    except ValueError as e:
        logger.error(f"Validation error for file deletion {file_id}: {e}")
        
    except Exception as e:
        logger.error(f"Failed to delete scenes for file {file_id}: {e}", exc_info=True)
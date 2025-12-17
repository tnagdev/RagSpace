from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.rabbitmq.rabbitmq_consumer import EventType
from src.services.prisma_service import PrismaService
import logging
from src.models.events import FileDeletedEventModel


logger = logging.getLogger(__name__)

@rabbitmq_consumer.register_handler(EventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel):
    try:
        prisma_service = PrismaService()
        if prisma_service.prisma is None:
            await prisma_service.connect()
        
        deleted = await prisma_service.prisma.scene.delete_many(
            where={"fileId": event.fileId}
        )
        logger.info(f"Deleted {deleted} scenes for file: {event.fileId}")
        
    except Exception as e:
        logger.error(f"Failed to delete scenes for file {event.fileId}: {e}", exc_info=True)
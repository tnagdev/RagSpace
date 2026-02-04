import logging
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.common.enums import EventType
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.models.events import FileDeletedEventModel

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(EventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion event by removing associated scenes and thumbnails.
    Supports both single file (fileId) and batch deletion (fileIds).
    
    Args:
        event: Validated file deletion event
    """
    try:
        # Collect file IDs from both sources
        file_ids = []
        if event.fileId:
            file_ids.append(event.fileId)
        if event.fileIds:
            file_ids.extend(event.fileIds)
        
        # Remove duplicates while preserving order
        file_ids = list(dict.fromkeys(file_ids))
        
        if not file_ids:
            raise ValueError("Missing fileId or fileIds in event")
        
        logger.info(f"Processing file deletion for {len(file_ids)} file(s): {file_ids}")
        
        prisma_service = PrismaService()
        await prisma_service.ensure_connected()
        
        # Fetch all scenes to get thumbnail S3 keys
        scenes = await prisma_service.prisma.scene.find_many(
            where={"fileId": {"in": file_ids}}
        )
        
        if scenes:
            # Extract thumbnail S3 keys
            thumbnail_keys = [scene.thumbnailS3Key for scene in scenes if scene.thumbnailS3Key]
            
            if thumbnail_keys:
                logger.info(f"Deleting {len(thumbnail_keys)} scene thumbnails from S3")
                s3_service = S3Service()
                deleted_count = await s3_service.delete_files_batch(thumbnail_keys)
                logger.info(f"✓ Deleted {deleted_count}/{len(thumbnail_keys)} thumbnails from S3")
        
        # Batch delete scenes from database
        result = await prisma_service.prisma.scene.delete_many(
            where={"fileId": {"in": file_ids}}
        )
        scenes_deleted = result if isinstance(result, int) else 0
        logger.info(f"✓ Deleted {scenes_deleted} scenes for {len(file_ids)} file(s)")
        
    except ValueError as e:
        logger.error(f"Validation error for file deletion: {e}")
        
    except Exception as e:
        logger.error(f"Failed to delete scenes: {e}", exc_info=True)
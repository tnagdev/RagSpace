import logging
import uuid
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.models.enums import EventType
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.models.events import FileDeletedEventModel
from src.utils.background_tasks import background_task_manager
from src.utils.correlation import correlation_id_var

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(EventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion event by removing associated scenes and thumbnails.
    Supports both single file (fileId) and batch deletion (fileIds).

    Args:
        event: Validated file deletion event
    """
    correlation_id = str(uuid.uuid4())
    token = correlation_id_var.set(correlation_id)
    try:
        file_ids = []
        if event.fileId:
            file_ids.append(event.fileId)
        if event.fileIds:
            file_ids.extend(event.fileIds)

        file_ids = list(dict.fromkeys(file_ids))

        if not file_ids or len(file_ids) == 0:
            raise ValueError("Missing fileId or fileIds in event")

        logger.info(f"[{correlation_id}] Processing file deletion for {len(file_ids)} file(s): {file_ids}")

        # Cancel any in-flight scene detection tasks immediately
        total_cancelled = sum(background_task_manager.cancel_file_tasks(fid) for fid in file_ids)
        if total_cancelled:
            logger.info(f"[{correlation_id}] Cancelled {total_cancelled} in-flight task(s)")

        prisma_service = PrismaService()
        await prisma_service.ensure_connected()

        scenes = await prisma_service.prisma.scene.find_many(
            where={"fileId": {"in": file_ids}}
        )

        if scenes:
            thumbnail_keys = [scene.thumbnailS3Key for scene in scenes if scene.thumbnailS3Key]
            if thumbnail_keys:
                logger.info(f"[{correlation_id}] Deleting {len(thumbnail_keys)} scene thumbnails from S3")
                s3_service = S3Service()
                deleted_count = await s3_service.delete_files_batch(thumbnail_keys)
                logger.info(f"[{correlation_id}] ✓ Deleted {deleted_count}/{len(thumbnail_keys)} thumbnails from S3")

        result = await prisma_service.prisma.scene.delete_many(
            where={"fileId": {"in": file_ids}}
        )
        scenes_deleted = result if isinstance(result, int) else 0
        logger.info(f"[{correlation_id}] ✓ Deleted {scenes_deleted} scenes for {len(file_ids)} file(s)")

    except ValueError as e:
        logger.error(f"[{correlation_id}] Validation error for file deletion: {e}")

    except Exception as e:
        logger.error(f"[{correlation_id}] Failed to delete scenes: {e}", exc_info=True)

    finally:
        correlation_id_var.reset(token)
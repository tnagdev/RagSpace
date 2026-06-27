import logging
import asyncio
import uuid
from datetime import datetime
from src.config.settings import settings
from src.models.enums import EventType, ProcessingStatus
from src.models.events import UploadCompletedEventModel, UpdateFileStatusParams
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.rabbitmq.rabbitmq_producer import RabbitMQProducer
from src.services.scene_processor import SceneProcessor
from src.services.upload_manager_client import UploadManagerClient
from src.utils.background_tasks import background_task_manager
from src.utils.correlation import correlation_id_var

logger = logging.getLogger(__name__)

_RETRY_BACKOFF_SECONDS = [5, 15, 45]


async def _process_file_in_background(event: UploadCompletedEventModel, correlation_id: str) -> None:
    """Background task that processes a file with configurable retry logic.

    Retry count is controlled by settings.max_processing_retries (default 1 = no retry).
    """
    file_id = event.fileId
    user_id = event.user.id if event.user else None
    max_retries = settings.max_processing_retries

    # Pre-flight: verify the file still exists before doing any heavy work
    upload_manager_client = UploadManagerClient(event.user, None)
    if not await upload_manager_client.get_file(file_id):
        logger.info(f"[{correlation_id}] File {file_id} not found in DB (likely deleted) — skipping scene detection")
        return

    for attempt in range(1, max_retries + 1):
        is_final = attempt == max_retries
        try:
            logger.info(
                f"[{correlation_id}] [Background] Processing file: {file_id} "
                f"(user: {user_id}, attempt: {attempt}/{max_retries})"
            )
            scene_processor = SceneProcessor(event.user, None)
            await scene_processor.process_file(file_id, event, is_final_attempt=is_final)
            logger.info(f"[{correlation_id}] [Background] ✓ Successfully processed file: {file_id}")
            return
        except Exception as e:
            logger.error(
                f"[{correlation_id}] [Background] Attempt {attempt}/{max_retries} failed "
                f"for file {file_id}: {e}",
                exc_info=True,
            )
            # Check if file was deleted during processing — abort cleanly without FAILED status
            if not await upload_manager_client.get_file(file_id):
                logger.info(f"[{correlation_id}] File {file_id} gone from DB — aborting scene detection")
                return
            if not is_final:
                producer = RabbitMQProducer()
                processor = SceneProcessor(event.user, None)
                try:
                    await processor.upload_manager_client.update_file_status(
                        file_id,
                        UpdateFileStatusParams(
                            processingRetryCount=attempt,
                            processingStatus=ProcessingStatus.IN_PROGRESS.value,
                        ),
                    )
                    await producer.publish_event(
                        'file.processing.retrying',
                        {
                            'type': 'file.processing.retrying',
                            'fileId': file_id,
                            'userId': user_id,
                            'timestamp': datetime.utcnow().isoformat(),
                            'data': {'attempt': attempt, 'maxRetries': max_retries},
                        },
                    )
                except Exception as notify_err:
                    logger.warning(f"Failed to publish retrying event: {notify_err}")

                delay = _RETRY_BACKOFF_SECONDS[min(attempt - 1, len(_RETRY_BACKOFF_SECONDS) - 1)]
                logger.info(f"[{correlation_id}] Retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)


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
        background_task_manager.create_task(
            _process_file_in_background(event, correlation_id),
            name=f"process-{file_id}",
            file_id=file_id,
        )
        logger.info(f"[{correlation_id}] Background task launched for file: {file_id}")

    except ValueError as e:
        logger.error(f"[{correlation_id}] Validation error for file {file_id}: {e}")
    finally:
        correlation_id_var.reset(token)
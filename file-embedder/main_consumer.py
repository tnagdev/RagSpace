"""
RabbitMQ Consumer Process for file embedding service.
Handles event-driven processing of file uploads and processing completion.
"""

import logging
import os
import asyncio
from src.config import settings
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.S3ClientService import S3ClientService
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.rabbitmq import handlers
from src.utils.background_tasks import background_task_manager
import pytesseract


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

os.makedirs(settings.temp_dir, exist_ok=True)

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


async def main():
    """Main function for RabbitMQ consumer process."""
    
    consumer_started = False
    
    try:
        logger.info("=== Starting File Embedder Consumer Process ===")
        logger.info(f"Temp directory: {settings.temp_dir}")
        os.makedirs(settings.temp_dir, exist_ok=True)
        
        logger.info("Initializing services...")
        chroma_db = ChromaDatabaseManager()
        S3ClientService()
        logger.info("✓ Core services initialized")
        
        VideoEmbedderService()
        logger.info("✓ Embedding services initialized")
        
        logger.info("Initializing ChromaDB collections...")
        chroma_db.get_text_collection()
        chroma_db.get_image_collection()
        logger.info("✓ ChromaDB collections ready")
        
        logger.info("Starting RabbitMQ consumer...")
        routing_keys = [
            FileEventType.UPLOAD_COMPLETED,
            FileEventType.PROCESSING_COMPLETED,
            FileEventType.FILE_DELETED
        ]
        await rabbitmq_consumer.start(routing_keys=routing_keys)
        consumer_started = True
        logger.info("✓ RabbitMQ consumer started")
        
        logger.info("=== File Embedder Consumer READY ===")
        logger.info("Listening for file events...")
        
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        
    except Exception as e:
        logger.error(f"FATAL: Consumer startup failed: {e}", exc_info=True)
        raise
    
    finally:
        logger.info("=== Shutting down File Embedder Consumer ===")
        
        # Stop accepting new messages
        if consumer_started:
            try:
                await rabbitmq_consumer.stop()
                logger.info("✓ RabbitMQ consumer stopped")
            except Exception as e:
                logger.error(f"Error stopping RabbitMQ consumer: {e}")
        
        # Wait for active background tasks to complete (with timeout)
        if background_task_manager.active_count > 0:
            logger.info(f"Waiting for {background_task_manager.active_count} background tasks to complete...")
            await background_task_manager.wait_for_all(timeout=30.0)
        
        logger.info("✓ Consumer shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Process terminated by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        exit(1)

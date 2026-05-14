"""
RabbitMQ Consumer Process for scene detector service.
Handles event-driven processing of video scene detection.
"""

import logging
import asyncio
from pathlib import Path
from src.config.settings import settings
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.rabbitmq.rabbitmq_producer import RabbitMQProducer
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.utils.background_tasks import background_task_manager
import src.rabbitmq.handlers
from src.models.enums import EventType

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Main function for RabbitMQ consumer process."""
    
    prisma_service = None
    rabbitmq_producer = None
    consumer_started = False

    try:
        logger.info("=== Starting Scene Detector Consumer Process ===")
        
        prisma_service = PrismaService()
        await prisma_service.connect()
        logger.info("✓ Database connected")
        
        S3Service()
        logger.info("✓ S3 service initialized")
        
        rabbitmq_producer = RabbitMQProducer()
        await rabbitmq_producer.connect()
        logger.info("✓ RabbitMQ producer connected")
        
        logger.info("Starting RabbitMQ consumer...")
        routing_keys = [
            EventType.UPLOAD_COMPLETED,
            EventType.FILE_DELETED
        ]
        await rabbitmq_consumer.start(routing_keys=routing_keys)
        consumer_started = True
        logger.info("✓ RabbitMQ consumer started")
        
        logger.info("=== Scene Detector Consumer READY ===")
        logger.info("Listening for file events...")
        
        # Keep the process running
        _heartbeat = Path("/tmp/consumer-health")
        try:
            while True:
                await asyncio.sleep(10)
                _heartbeat.touch()
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        
    except Exception as e:
        logger.error(f"FATAL: Consumer startup failed: {e}", exc_info=True)
        raise
        
    finally:
        logger.info("=== Shutting down Scene Detector Consumer ===")
        
        # Stop accepting new messages
        if consumer_started:
            try:
                await rabbitmq_consumer.stop()
                logger.info("✓ RabbitMQ consumer stopped")
            except Exception as e:
                logger.error(f"Error stopping consumer: {e}")
        
        # Wait for active background tasks to complete (with timeout)
        if background_task_manager.active_count > 0:
            logger.info(f"Waiting for {background_task_manager.active_count} background tasks to complete...")
            await background_task_manager.wait_for_all(timeout=30.0)
        
        try:
            if rabbitmq_producer:
                await rabbitmq_producer.disconnect()
                logger.info("✓ RabbitMQ producer disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting producer: {e}")
        
        try:
            if prisma_service:
                await prisma_service.disconnect()
                logger.info("✓ Database disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting database: {e}")
        
        logger.info("✓ Consumer shutdown complete")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Process terminated by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        exit(1)

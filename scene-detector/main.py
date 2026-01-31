"""
Combined mode for Scene Detector Service.
Runs both HTTP server and RabbitMQ consumer in one process.

⚠️ DEPRECATED: This combined mode is kept for backward compatibility.
   For production use, run the separated processes:
   - main_server.py (HTTP server)
   - main_consumer.py (RabbitMQ consumer)

   See docker-compose.yml for the recommended setup.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config.settings import settings
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.rabbitmq.rabbitmq_producer import RabbitMQProducer
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.middleware.InterServiceMiddleware import InterServiceMiddleware
from src.routes.scenes import router as scenes_router
from src.utils.background_tasks import background_task_manager
import src.rabbitmq.handlers
from src.models.enums import EventType

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    
    prisma_service = None
    rabbitmq_producer = None

    try:
        logger.info("Starting Scene Detector Service...")
        prisma_service = PrismaService()
        await prisma_service.connect()
        logger.info("✓ Database connected")
        
        S3Service()
        logger.info("✓ S3 service initialized")
        
        rabbitmq_producer = RabbitMQProducer()
        await rabbitmq_producer.connect()
        logger.info("✓ RabbitMQ producer connected")
        
        routing_keys = [
            EventType.UPLOAD_COMPLETED,
            EventType.FILE_DELETED
        ]
        await rabbitmq_consumer.start(routing_keys=routing_keys)
        logger.info("✓ RabbitMQ consumer started")
        
        logger.info("✓ Scene Detector Service ready")
        yield
        
    except Exception as e:
        logger.error(f"Failed to start service: {e}", exc_info=True)
        raise
        
    finally:
        logger.info("Shutting down Scene Detector Service...")
        
        # Stop accepting new messages
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
        
        logger.info("✓ Scene Detector Service shutdown complete")


app = FastAPI(
    title="Scene Detector Service",
    description="Processes video files for scene detection and thumbnail generation",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(InterServiceMiddleware)
app.include_router(scenes_router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "scene-detector",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Comprehensive health check endpoint."""
    health_status = {
        "service": "scene-detector",
        "status": "running",
        "version": "1.0.0",
        "database": "unknown",
        "rabbitmq": "unknown"
    }
    
    
    try:
        prisma_service = PrismaService()
        if prisma_service.prisma:
            await prisma_service.prisma.execute_raw("SELECT 1")
            health_status["database"] = "connected"
        else:
            health_status["database"] = "not_initialized"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["database"] = "disconnected"
    
    try:
        if rabbitmq_consumer._is_consuming:
            health_status["rabbitmq"] = "connected"
        else:
            health_status["rabbitmq"] = "disconnected"
    except Exception as e:
        logger.error(f"RabbitMQ health check failed: {e}")
        health_status["rabbitmq"] = "error"
    
    return health_status


if __name__ == "__main__":
    import uvicorn
    
    port = settings.port
    logger.info(f"Starting Scene Detector Service on port {port}")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.mode == "development",
        log_level="info"
    )

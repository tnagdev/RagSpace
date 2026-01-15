import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config.settings import settings
from src.rabbitmq.rabbitmq_consumer import rabbitmq_consumer
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.middleware.InterServiceMiddleware import InterServiceMiddleware
from src.routes.scenes import router as scenes_router
import src.rabbitmq.handlers
from src.models.enums import EventType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown"""
    
    try:
        # Connect to Prisma
        prisma_service = PrismaService()
        await prisma_service.connect()
        logger.info("Connected to Prisma database")

        S3Service()
        
        # Start RabbitMQ consumer
        routing_keys = [
            EventType.UPLOAD_COMPLETED,
            EventType.FILE_DELETED
        ]
        await rabbitmq_consumer.start(routing_keys=routing_keys)
        logger.info("RabbitMQ consumer started")
        yield
        
    finally:
        # Shutdown
        logger.info("Shutting down Scene Detector Service...")
        
        # Stop RabbitMQ consumer
        if hasattr(rabbitmq_consumer, 'stop'):
            await rabbitmq_consumer.stop()
            logger.info("RabbitMQ consumer stopped")
        
        # Disconnect from Prisma
        await prisma_service.disconnect()
        logger.info("Disconnected from Prisma database")


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
    """Health check endpoint with detailed status"""
    try:
        prisma_service = PrismaService()
        await prisma_service.prisma.execute_raw("SELECT 1")
        prisma_status = "connected"
    except Exception as e:
        logger.error(f"Prisma health check failed: {e}")
        prisma_status = "disconnected"
    
    return {
        "service": "scene-detector",
        "status": "running",
        "database": prisma_status,
        "rabbitmq": "connected" if hasattr(app.state, 'consumer') else "disconnected"
    }


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", settings.port))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.mode == "development"
    )

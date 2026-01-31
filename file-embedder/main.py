"""
FastAPI application for file embedding service.
Processes audio and video content to generate embeddings for semantic search.

⚠️ DEPRECATED: This combined mode is kept for backward compatibility.
   For production use, run the separated processes:
   - main_server.py (HTTP server)
   - main_consumer.py (RabbitMQ consumer)

   See docker-compose.yml for the recommended setup.
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from src.config import settings
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.services.S3ClientService import S3ClientService
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.rabbitmq import handlers
from src.routers import Search
from src.services.LLMService import LLMService
from src.middlewares.InterServiceMiddleware import InterServiceMiddleware
from src.utils.background_tasks import background_task_manager
import pytesseract


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

os.makedirs(settings.temp_dir, exist_ok=True)

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    
    # Startup: Initialize all services
    consumer_started = False
    
    try:
        logger.info("=== Starting File Embedder Service ===")
        logger.info(f"Temp directory: {settings.temp_dir}")
        os.makedirs(settings.temp_dir, exist_ok=True)
        
        logger.info("Initializing services...")
        chroma_db = ChromaDatabaseManager()
        S3ClientService()
        LLMService()
        logger.info("✓ Core services initialized")
        
        VideoEmbedderService()
        logger.info("✓ Embedding services initialized")

        AdvancedRetrieverService()
        logger.info("✓ Retriever service initialized")
        
        logger.info("Initializing ChromaDB collections...")
        chroma_db.get_text_collection()
        chroma_db.get_image_collection()
        logger.info("✓ ChromaDB collections ready")
        
        try:
            logger.info("Starting RabbitMQ consumer...")
            routing_keys = [
                FileEventType.UPLOAD_COMPLETED,
                FileEventType.PROCESSING_COMPLETED,
                FileEventType.FILE_DELETED
            ]
            await rabbitmq_consumer.start(routing_keys=routing_keys)
            consumer_started = True
            logger.info("✓ RabbitMQ consumer started")
        except Exception as e:
            logger.warning(f"Failed to start RabbitMQ consumer (continuing without it): {e}")
        
        logger.info("=== File Embedder Service READY ===")
        
    except Exception as e:
        logger.error(f"FATAL: Startup failed: {e}", exc_info=True)
        raise
    
    yield
    
    logger.info("=== Shutting down File Embedder Service ===")
    
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
    
    logger.info("✓ Shutdown complete")



app = FastAPI(
    title="File Embedder Service",
    description="Service for generating embeddings from audio and video files",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(InterServiceMiddleware)
app.include_router(router=Search.router, prefix='/embed')


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "file-embedder",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint."""
    try:
        chroma_db = ChromaDatabaseManager()
        chroma_db.get_text_collection()
        chroma_db.get_image_collection()
        
        return {
            "service": "file-embedder",
            "status": "healthy",
            "chroma_db": "connected",
            "rabbitmq": "connected" if rabbitmq_consumer._is_consuming else "disconnected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    
    port = settings.port
    logger.info(f"Starting File Embedder Service on port {port}")
    logger.info(f"Mode: {settings.mode}")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.mode == "development",
        log_level="info"
    )

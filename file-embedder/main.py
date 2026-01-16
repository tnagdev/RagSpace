"""
FastAPI application for file embedding service.
Processes audio and video content to generate embeddings for semantic search.
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
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    consumer_started = False
    
    try:
        # Startup
        logger.info("Starting file-embedder service...")
        logger.info(f"Temp directory: {settings.temp_dir}")
        
        # Initialize singletons in correct order
        # Order matters: base services first, then services that depend on them
        logger.info("Initializing services...")
        
        # 1. Core infrastructure (no dependencies)
        chroma_db = ChromaDatabaseManager()
        S3ClientService()  # Now uses settings defaults
        LLMService()
        
        # 2. VideoEmbedderService initializes the full embedding hierarchy
        #    (includes TextEmbedderService, AudioEmbedderService, ImageEmbedderService)
        VideoEmbedderService()
        
        # 3. Services that depend on embedders
        AdvancedRetrieverService()
        
        logger.info("✓ Services initialized")
        
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
            logger.warning(f"Failed to start RabbitMQ consumer (will continue): {e}")
        
        logger.info("=== File Embedder Service READY ===")
    except Exception as e:
        logger.error(f"FATAL: Error during startup: {e}", exc_info=True)
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down file-embedder service...")
    if consumer_started:
        try:
            await rabbitmq_consumer.stop()
            logger.info("RabbitMQ consumer stopped")
        except Exception as e:
            logger.error(f"Error stopping RabbitMQ consumer: {e}")



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
    """Health check endpoint."""
    try:
        chroma_db = ChromaDatabaseManager()
        chroma_db.get_text_collection()
        chroma_db.get_image_collection() 
        return {
            "status": "healthy",
            "chroma_db": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", settings.service_port))
    logger.info(f"Starting uvicorn on 0.0.0.0:{port}")
    logger.info(f"Mode: {settings.mode}")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

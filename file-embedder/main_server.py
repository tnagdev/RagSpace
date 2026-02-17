"""
FastAPI HTTP Server for file embedding service.
Handles search queries and health checks.
"""

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from src.config import settings
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.db.chroma_db import ChromaDatabaseManager
from src.routers import Search
from src.services.LLMService import LLMService
from src.middlewares.InterServiceMiddleware import InterServiceMiddleware
from src.services.TextEmbedderService import TextEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
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
    
    try:
        logger.info("=== Starting File Embedder HTTP Server ===")
        logger.info(f"Temp directory: {settings.temp_dir}")
        os.makedirs(settings.temp_dir, exist_ok=True)
        
        logger.info("Initializing services...")
        chroma_db = ChromaDatabaseManager()
        LLMService()
        logger.info("✓ Core services initialized")

        logger.info("Initializing embedder services...")
        TextEmbedderService()
        logger.info("✓ Text embedder initialized")
        ImageEmbedderService()
        logger.info("✓ Image embedder initialized")
        
        AdvancedRetrieverService()
        logger.info("✓ Retriever service initialized")
        
        logger.info("Initializing ChromaDB collections...")
        chroma_db.get_text_collection()
        chroma_db.get_image_collection()
        logger.info("✓ ChromaDB collections ready")
        
        logger.info("=== File Embedder HTTP Server READY ===")
        
    except Exception as e:
        logger.error(f"FATAL: Server startup failed: {e}", exc_info=True)
        raise
    
    yield
    
    logger.info("=== Shutting down File Embedder HTTP Server ===")
    logger.info("✓ Server shutdown complete")


app = FastAPI(
    title="File Embedder Service",
    description="Service for semantic search of audio and video embeddings",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(InterServiceMiddleware)
app.include_router(router=Search.router, prefix='/embed')


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "file-embedder-server",
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
            "service": "file-embedder-server",
            "status": "healthy",
            "chroma_db": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    
    port = settings.port
    logger.info(f"Starting File Embedder HTTP Server on port {port}")
    logger.info(f"Mode: {settings.mode}")
    
    uvicorn.run(
        "main_server:app",
        host="0.0.0.0",
        port=port,
        reload=settings.mode == "development",
        log_level="info"
    )

"""
FastAPI application for chat-manager service.
Handles conversational search over video content with context awareness.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config import settings
from src.routers import chat, conversations
from src.middlewares.InterServiceMiddleware import InterServiceMiddleware
from src.services.PrismaService import PrismaService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting chat-manager service...")
    logger.info(f"File embedder URL: {settings.file_embedder_url}")
    
    # Connect to Prisma database
    prisma_service = PrismaService()
    await prisma_service.connect()
    logger.info("Connected to Prisma database")
    
    yield
    
    # Shutdown
    logger.info("Shutting down chat-manager service...")
    await prisma_service.disconnect()
    logger.info("Disconnected from Prisma database")


app = FastAPI(
    title="Chat Manager Service",
    description="Conversational search interface for video content",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

app.add_middleware(InterServiceMiddleware)

app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "port": settings.port
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

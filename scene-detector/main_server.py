"""
FastAPI HTTP Server for scene detector service.
Handles scene queries and health checks.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config.settings import settings
from src.services.prisma_service import PrismaService
from src.middleware.InterServiceMiddleware import InterServiceMiddleware
from src.routes.scenes import router as scenes_router

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    
    prisma_service = None

    try:
        logger.info("=== Starting Scene Detector HTTP Server ===")
        
        prisma_service = PrismaService()
        await prisma_service.connect()
        logger.info("✓ Database connected")
        
        logger.info("=== Scene Detector HTTP Server READY ===")
        yield
        
    except Exception as e:
        logger.error(f"Failed to start server: {e}", exc_info=True)
        raise
        
    finally:
        logger.info("=== Shutting down Scene Detector HTTP Server ===")
        
        try:
            if prisma_service:
                await prisma_service.disconnect()
                logger.info("✓ Database disconnected")
        except Exception as e:
            logger.error(f"Error disconnecting database: {e}")
        
        logger.info("✓ Server shutdown complete")


app = FastAPI(
    title="Scene Detector Service",
    description="Query interface for video scenes and thumbnails",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(InterServiceMiddleware)
app.include_router(scenes_router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "scene-detector-server",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Comprehensive health check endpoint."""
    health_status = {
        "service": "scene-detector-server",
        "status": "running",
        "version": "1.0.0",
        "database": "unknown"
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
    
    return health_status


if __name__ == "__main__":
    import uvicorn
    
    port = settings.port
    logger.info(f"Starting Scene Detector HTTP Server on port {port}")

    uvicorn.run(
        "main_server:app",
        host="0.0.0.0",
        port=port,
        reload=settings.mode == "development",
        log_level="info"
    )

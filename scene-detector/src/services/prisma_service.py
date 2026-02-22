import logging
from typing import Optional
from contextlib import asynccontextmanager
from prisma import Prisma
from src.config.settings import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class PrismaService(metaclass=SingletonMeta):
    """Singleton service for managing Prisma database connections."""

    def __init__(self) -> None:
        self.prisma: Optional[Prisma] = None
        self._is_connected: bool = False

    async def connect(self) -> None:
        """Establish connection to the database."""
        if self._is_connected and self.prisma and self.prisma.is_connected():
            logger.debug("Already connected to database")
            return
        
        try:
            logger.info("Connecting to database...")
            self.prisma = Prisma(datasource={"url": settings.database_url})
            await self.prisma.connect()
            self._is_connected = True
            logger.info("✓ Database connection established")
            
        except Exception as e:
            logger.error(f"Database connection failed: {e}", exc_info=True)
            self._is_connected = False
            raise
    
    async def disconnect(self) -> None:
        """Close the database connection."""
        if self.prisma and self._is_connected:
            try:
                await self.prisma.disconnect()
                logger.info("✓ Database disconnected")
            except Exception as e:
                logger.error(f"Error disconnecting from database: {e}")
            finally:
                self._is_connected = False
                self.prisma = None
    
    async def ensure_connected(self) -> None:
        """Ensure the database connection is active, reconnecting if necessary."""
        if not self._is_connected or not self.prisma:
            await self.connect()
        elif not self.prisma.is_connected():
            logger.warning("Database connection lost, reconnecting...")
            self._is_connected = False
            await self.connect()
    
    @asynccontextmanager
    async def transaction(self):
        """Context manager for database transactions.
        
        Usage:
            async with prisma_service.transaction() as tx:
                await tx.scene.create(...)
        """
        await self.ensure_connected()
        async with self.prisma.tx() as transaction:
            yield transaction
    
    @property
    def is_connected(self) -> bool:
        """Check if database is currently connected."""
        return self._is_connected and self.prisma is not None and self.prisma.is_connected()

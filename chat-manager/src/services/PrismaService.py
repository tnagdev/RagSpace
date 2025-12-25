"""Prisma service for database connection"""
import logging
from typing import Optional
from prisma import Prisma
from src.config import settings
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)


@singleton
class PrismaService:
    """Singleton Prisma database service"""

    def __init__(self):
        self.prisma: Optional[Prisma] = None

    async def connect(self):
        """Connect to the database"""
        if self.prisma is None:
            self.prisma = Prisma(datasource={"url": settings.direct_url})
            await self.prisma.connect()
            logger.info("Prisma connected to database")    
    
    async def disconnect(self):
        """Disconnect from the database"""
        if self.prisma:
            await self.prisma.disconnect()
            self.prisma = None
            logger.info("Prisma disconnected from database")
    
    async def ensure_connected(self):
        """Ensure the database connection is active"""
        if self.prisma is None:
            await self.connect()

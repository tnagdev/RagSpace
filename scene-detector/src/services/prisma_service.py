import logging
from typing import Optional
from prisma import Prisma
from src.config.settings import settings
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)

@singleton
class PrismaService:

    def __init__(self):
        self.prisma: Optional[Prisma] = None

    async def connect(self):
        if self.prisma is None:
            self.prisma = Prisma(datasource={"url": settings.direct_url})
            await self.prisma.connect()
            logger.info("Prisma connected to database")    
    
    async def disconnect(self):
        if self.prisma:
            await self.prisma.disconnect()
            self.prisma = None
            logger.info("Prisma disconnected from database")
    
    async def ensure_connected(self):
        if self.prisma is None:
            await self.connect()

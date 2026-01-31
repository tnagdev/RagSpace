"""Prisma service for database connection"""
import logging
from typing import Optional
from prisma import Prisma
from src.config import settings

logger = logging.getLogger(__name__)


class PrismaService:
    """Global Prisma database service with connection pooling"""
    _instance: Optional['PrismaService'] = None
    _prisma: Optional[Prisma] = None
    _initialized: bool = False

    def __new__(cls):
        """Ensure only one instance exists"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize only once"""
        if not PrismaService._initialized:
            PrismaService._initialized = True
            logger.info("PrismaService singleton initialized")

    @property
    def prisma(self) -> Prisma:
        """Get the shared Prisma client instance"""
        if PrismaService._prisma is None:
            raise RuntimeError("Prisma not connected. Call connect() first.")
        return PrismaService._prisma

    async def connect(self):
        """Connect to the database with connection pooling"""
        if PrismaService._prisma is None:
            PrismaService._prisma = Prisma(datasource={"url": settings.database_url})
            await PrismaService._prisma.connect()
            logger.info("Prisma connected to database")
    
    async def disconnect(self):
        """Disconnect from the database"""
        if PrismaService._prisma:
            await PrismaService._prisma.disconnect()
            PrismaService._prisma = None
            logger.info("Prisma disconnected from database")
    
    async def ensure_connected(self):
        """Ensure the database connection is active"""
        if PrismaService._prisma is None:
            await self.connect()

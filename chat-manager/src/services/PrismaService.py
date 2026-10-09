from prisma import Prisma

from src.config import settings


class PrismaService:
    _instance: "PrismaService | None" = None
    _prisma: Prisma | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def prisma(self) -> Prisma:
        if PrismaService._prisma is None:
            raise RuntimeError("Prisma not connected; call connect() first")
        return PrismaService._prisma

    async def connect(self) -> None:
        if PrismaService._prisma is None:
            PrismaService._prisma = Prisma(datasource={"url": settings.database_url})
            await PrismaService._prisma.connect()

    async def disconnect(self) -> None:
        if PrismaService._prisma is not None:
            await PrismaService._prisma.disconnect()
            PrismaService._prisma = None

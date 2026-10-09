import asyncio
import logging
import signal

from ragspace_shared.context import configure_logging

from src.events import event_bus
from src.handlers import handle_event
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.utils.background_tasks import background_task_manager

configure_logging("scene-detector-consumer")
logger = logging.getLogger(__name__)


async def main() -> None:
    prisma = PrismaService()
    await prisma.connect()
    S3Service()
    await event_bus.start()
    await event_bus.subscribe("scenes.events", ["file.uploaded", "file.deleted", "user.deleted"], handle_event, prefetch=10)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    try:
        await stop.wait()
    finally:
        await background_task_manager.wait_for_all(timeout=30.0)
        await event_bus.close()
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())

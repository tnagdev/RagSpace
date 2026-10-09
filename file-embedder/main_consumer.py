import asyncio
import logging
import signal

import pytesseract
from ragspace_shared.context import configure_logging
from ragspace_shared.events import heartbeat

from src.config import settings
from src.db.chroma_db import ChromaDatabaseManager
from src.decorators.cpu_manager import run_cpu
from src.events import event_bus
from src.handlers import handle_event
from src.services.LLMService import LLMService
from src.services.S3ClientService import S3ClientService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.utils.background_tasks import file_tasks

configure_logging("file-embedder-consumer")
logger = logging.getLogger(__name__)

if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


async def main() -> None:
    await run_cpu(ChromaDatabaseManager)
    await run_cpu(VideoEmbedderService)
    S3ClientService()
    LLMService()
    await event_bus.start()
    await event_bus.subscribe(
        "search.events",
        ["file.uploaded", "file.scenes_detected", "file.deleted", "user.deleted"],
        handle_event,
        prefetch=10,
    )
    beat = asyncio.create_task(heartbeat(event_bus))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    try:
        await stop.wait()
    finally:
        beat.cancel()
        await event_bus.close()
        await file_tasks.drain(timeout=30.0)


if __name__ == "__main__":
    asyncio.run(main())

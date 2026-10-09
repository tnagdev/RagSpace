import asyncio
import contextvars
from concurrent.futures import ThreadPoolExecutor

from src.config import settings

cpu_executor = ThreadPoolExecutor(max_workers=max(1, settings.cpu_workers))


async def run_cpu(fn, *args):
    # run_in_executor does not carry contextvars, which would drop the correlation id from worker-thread logs.
    context = contextvars.copy_context()
    return await asyncio.get_running_loop().run_in_executor(cpu_executor, context.run, fn, *args)

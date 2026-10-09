import asyncio
from concurrent.futures import ThreadPoolExecutor

from src.config import settings

cpu_executor = ThreadPoolExecutor(max_workers=max(1, settings.cpu_workers))


async def run_cpu(fn, *args):
    return await asyncio.get_running_loop().run_in_executor(cpu_executor, fn, *args)

from concurrent.futures import ThreadPoolExecutor
from src.config import settings

cpu_executor = ThreadPoolExecutor(max_workers=max(1, settings.cpu_workers))

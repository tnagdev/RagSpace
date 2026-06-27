import os
from concurrent.futures import ThreadPoolExecutor

CPU_COUNT = os.cpu_count() or 4
MAX_WORKERS = max(1, CPU_COUNT)

cpu_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

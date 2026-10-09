import asyncio
import logging
from typing import Any, Coroutine

logger = logging.getLogger(__name__)


class FileTasks:
    def __init__(self) -> None:
        self._by_file: dict[str, set[asyncio.Task]] = {}
        self._all: set[asyncio.Task] = set()

    def start(self, file_id: str, coro: Coroutine[Any, Any, Any], name: str) -> asyncio.Task:
        task = asyncio.create_task(coro, name=name)
        self._all.add(task)
        self._by_file.setdefault(file_id, set()).add(task)
        task.add_done_callback(lambda done: self._finished(file_id, done))
        return task

    def cancel(self, file_id: str) -> int:
        tasks = self._by_file.pop(file_id, set())
        for task in tasks:
            task.cancel()
        return len(tasks)

    async def drain(self, timeout: float) -> None:
        if self._all:
            await asyncio.wait(self._all, timeout=timeout)

    @property
    def active(self) -> int:
        return len(self._all)

    def _finished(self, file_id: str, task: asyncio.Task) -> None:
        self._all.discard(task)
        tasks = self._by_file.get(file_id)
        if tasks is not None:
            tasks.discard(task)
            if not tasks:
                self._by_file.pop(file_id, None)
        if not task.cancelled() and task.exception() is not None:
            logger.error("Task %s failed", task.get_name(), exc_info=task.exception())


file_tasks = FileTasks()

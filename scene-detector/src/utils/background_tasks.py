"""Background task management utilities for non-blocking processing."""
import asyncio
import logging
import os
import time
from typing import Set, Coroutine, Any, Optional

logger = logging.getLogger(__name__)


class BackgroundTaskManager:
    """Manages background tasks to prevent blocking and ensure proper cleanup."""

    def __init__(self, max_concurrent: int = 5):
        """Initialize task manager.

        Args:
            max_concurrent: Maximum number of concurrent background tasks
        """
        self._tasks: Set[asyncio.Task] = set()
        self._file_tasks: dict[str, set[asyncio.Task]] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent

    def create_task(
        self,
        coro: Coroutine[Any, Any, Any],
        name: str = None,
        timeout: Optional[float] = None,
        file_id: str | None = None,
    ) -> asyncio.Task:
        """Create a background task with optional timeout and concurrency limit.

        Args:
            coro: Coroutine to run in background
            name: Optional name for the task (for logging)
            timeout: Optional timeout in seconds (default: no timeout)
            file_id: Optional file ID to associate with this task for cancellation

        Returns:
            The created asyncio Task
        """
        # Wrap with timeout and concurrency limit
        wrapped_coro = self._wrap_task(coro, name, timeout)
        task = asyncio.create_task(wrapped_coro, name=name)
        self._tasks.add(task)
        task.add_done_callback(self._task_done_callback)
        if file_id:
            self._file_tasks.setdefault(file_id, set()).add(task)
            task.add_done_callback(
                lambda t: self._file_tasks.get(file_id, set()).discard(t)
            )

        logger.info(
            f"Created background task: {name or task.get_name()} "
            f"(active: {len(self._tasks)}/{self._max_concurrent})"
        )
        return task

    def cancel_file_tasks(self, file_id: str) -> int:
        """Cancel all background tasks for a specific file.

        Returns:
            Number of tasks that were cancelled
        """
        tasks = self._file_tasks.pop(file_id, set())
        cancelled = 0
        for task in tasks:
            if not task.done():
                task.cancel()
                cancelled += 1
        if cancelled:
            logger.info(f"Cancelled {cancelled} background task(s) for file {file_id}")
        return cancelled
    
    async def _wrap_task(
        self,
        coro: Coroutine[Any, Any, Any],
        task_name: Optional[str],
        timeout: Optional[float]
    ) -> Any:
        """Wrap task with concurrency limit and timeout.
        
        This runs INSIDE the background task, not during create_task.
        """
        # Acquire semaphore inside the task (non-blocking to event loop)
        async with self._semaphore:
            start_time = time.time()
            try:
                # Apply timeout if specified
                if timeout:
                    result = await asyncio.wait_for(coro, timeout=timeout)
                else:
                    result = await coro
                
                duration = time.time() - start_time
                logger.info(f"Task {task_name} completed in {duration:.2f}s")
                return result
                
            except asyncio.TimeoutError:
                duration = time.time() - start_time
                logger.error(f"Task {task_name} exceeded timeout of {timeout}s after {duration:.2f}s")
                raise
            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"Task {task_name} failed after {duration:.2f}s: {e}",
                    exc_info=True
                )
                raise
    
    def _task_done_callback(self, task: asyncio.Task):
        """Callback when task completes - log errors and remove from tracking."""
        self._tasks.discard(task)
        
        task_name = task.get_name()
        
        if task.cancelled():
            logger.warning(f"Background task cancelled: {task_name}")
            return
        
        try:
            exception = task.exception()
            if exception:
                logger.error(
                    f"Background task {task_name} failed with exception: {exception}",
                    exc_info=exception
                )
        except asyncio.CancelledError:
            logger.warning(f"Background task cancelled during cleanup: {task_name}")
        except Exception as e:
            logger.error(f"Error checking task exception for {task_name}: {e}")
    
    async def wait_for_all(self, timeout: float = None):
        """Wait for all background tasks to complete.
        
        Args:
            timeout: Maximum time to wait in seconds (None for no timeout)
        """
        if not self._tasks:
            return
        
        logger.info(f"Waiting for {len(self._tasks)} background tasks to complete...")
        
        try:
            await asyncio.wait_for(
                asyncio.gather(*self._tasks, return_exceptions=True),
                timeout=timeout
            )
            logger.info("All background tasks completed")
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for {len(self._tasks)} tasks to complete")
        except Exception as e:
            logger.error(f"Error waiting for tasks: {e}")
    
    def cancel_all(self):
        """Cancel all running background tasks."""
        if not self._tasks:
            return
        
        logger.info(f"Cancelling {len(self._tasks)} background tasks...")
        for task in self._tasks:
            if not task.done():
                task.cancel()
    
    @property
    def active_count(self) -> int:
        """Get the number of active background tasks."""
        return len(self._tasks)
    
    @property
    def available_slots(self) -> int:
        """Get the number of available task slots."""
        return self._max_concurrent - len(self._tasks)
    
    @property
    def is_at_capacity(self) -> bool:
        """Check if at maximum capacity."""
        return len(self._tasks) >= self._max_concurrent


# Global instance for the scene-detector service
# Dynamic concurrency based on CPU cores: max(2, min(cpu_count // 2, 6))
CPU_COUNT = os.cpu_count() or 4
MAX_CONCURRENT_TASKS = max(2, min(CPU_COUNT // 2, 6))
background_task_manager = BackgroundTaskManager(max_concurrent=MAX_CONCURRENT_TASKS)

logger.info(f"Background task manager initialized with {MAX_CONCURRENT_TASKS} max concurrent tasks (CPU cores: {CPU_COUNT})")

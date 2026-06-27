"""Track deleted file IDs within this process to guard ChromaDB writes.

No lock needed — asyncio is single-threaded; all access is on the event loop.
"""

_deleted_file_ids: set[str] = set()


def mark_deleted(file_id: str) -> None:
    _deleted_file_ids.add(file_id)


def is_deleted(file_id: str) -> bool:
    return file_id in _deleted_file_ids

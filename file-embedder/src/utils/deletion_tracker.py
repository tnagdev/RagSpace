"""In-process record of deletions, checked before Chroma writes so in-flight work can't resurrect data."""

_deleted_files: set[str] = set()
_deleted_users: set[str] = set()


def mark_files_deleted(file_ids: list[str]) -> None:
    _deleted_files.update(file_ids)


def mark_user_deleted(user_id: str) -> None:
    _deleted_users.add(user_id)


def is_deleted(file_id: str, user_id: str) -> bool:
    return file_id in _deleted_files or user_id in _deleted_users

"""Deletes Chroma records whose file no longer exists in upload-manager.

Files deleted before file.deleted purged embeddings left their records behind; they crowd out live
hits in search. Lists what it would delete unless --apply is given:

    docker compose -f docker-compose.dev.yml exec file-embedder-server python scripts/purge_orphans.py [--apply]
"""
import asyncio
import sys
from collections import defaultdict

from src.clients import batch_get_files
from src.db.chroma_db import ChromaDatabaseManager

BATCH = 100


def indexed_files(db: ChromaDatabaseManager) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for collection in (db.text_collection, db.image_collection):
        for metadata in collection.get(include=["metadatas"])["metadatas"]:
            counts[metadata.get("user_id") or ""][metadata.get("file_id") or ""] += 1
    return counts


async def orphans(counts: dict[str, dict[str, int]]) -> list[tuple[str, str, int]]:
    missing = []
    for user_id, files in counts.items():
        file_ids = [file_id for file_id in files if file_id]
        live: set[str] = set()
        if user_id:
            for start in range(0, len(file_ids), BATCH):
                live.update(await batch_get_files(user_id, file_ids[start:start + BATCH]))
        missing.extend((user_id, file_id, files[file_id]) for file_id in file_ids if file_id not in live)
    return missing


def main() -> None:
    apply = "--apply" in sys.argv[1:]
    db = ChromaDatabaseManager()
    missing = asyncio.run(orphans(indexed_files(db)))
    for user_id, file_id, records in missing:
        print(f"{'deleting' if apply else 'would delete'} {records:5d} records  user={user_id or '-'} file={file_id}")
    if apply:
        for start in range(0, len(missing), BATCH):
            db.delete_by_file_ids([file_id for _, file_id, _ in missing[start:start + BATCH]])
    print(f"{len(missing)} orphaned files, {sum(r for _, _, r in missing)} records{'' if apply else ' (dry run; pass --apply)'}")


if __name__ == "__main__":
    main()

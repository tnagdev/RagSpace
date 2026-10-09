"""Copies visual descriptions from upload.file_metadata onto the Chroma records they describe.

Run once before the file_metadata table is dropped:

    docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d postgres -At -c "
      SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
        SELECT m.\"fileId\" AS file_id, m.\"sourceType\" AS source_type, m.summary, m.objects,
               m.setting, m.style, m.colors, m.\"sceneId\" AS scene_id, s.\"sceneNumber\" AS scene_number
        FROM upload.file_metadata m
        LEFT JOIN scene_detector.\"Scene\" s ON s.id = m.\"sceneId\") t" \
    | docker compose -f docker-compose.dev.yml exec -T file-embedder-server python scripts/backfill_visual_metadata.py
"""
import json
import sys
from types import SimpleNamespace

from src.db.chroma_db import ChromaDatabaseManager, visual_metadata

BATCH = 100


def _targets(row: dict) -> list[tuple[str, dict]]:
    file_id = row["file_id"]
    if row["source_type"] == "IMAGE":
        return [(f"{file_id}#image#0", {}), (f"{file_id}#image#1", {})]
    if row["source_type"] != "SCENE" or row.get("scene_number") is None:
        return []
    chunk = f"{file_id}#scene_{row['scene_number'] - 1}"
    return [(chunk, {"scene_id": row["scene_id"]}), (f"{chunk}#text", {"scene_id": row["scene_id"]})]


def _metadata(row: dict) -> dict:
    description = SimpleNamespace(
        summary=row.get("summary"),
        objects=row.get("objects"),
        setting=row.get("setting"),
        style=row.get("style"),
        colors=row.get("colors"),
        characters_present=None,
    )
    stored = visual_metadata(description)
    stored.pop("characters_present")
    return stored


def main() -> None:
    rows = json.load(sys.stdin)
    updates: dict[str, dict] = {}
    for row in rows:
        for chunk_id, extra in _targets(row):
            updates[chunk_id] = {**_metadata(row), **extra}

    chroma = ChromaDatabaseManager()
    ids = list(updates)
    updated = 0
    for collection in (chroma.text_collection, chroma.image_collection):
        for start in range(0, len(ids), BATCH):
            existing = collection.get(ids=ids[start:start + BATCH], include=["metadatas"])["ids"]
            if existing:
                collection.update(ids=existing, metadatas=[updates[i] for i in existing])
                updated += len(existing)
    print(f"Backfilled {updated} Chroma records from {len(rows)} metadata rows")


if __name__ == "__main__":
    main()

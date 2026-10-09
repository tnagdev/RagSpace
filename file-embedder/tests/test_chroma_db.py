import json
from types import SimpleNamespace

import numpy as np

from src.db.chroma_db import parse_visual, visual_metadata


def _query_result(*rows):
    return {
        "ids": [[f"id-{i}" for i in range(len(rows))]],
        "metadatas": [[meta for meta, _, _ in rows]],
        "distances": [[distance for _, distance, _ in rows]],
        "documents": [[doc for _, _, doc in rows]],
    }


def test_upsert_batches_and_cleans_metadata(chroma, monkeypatch):
    monkeypatch.setattr("src.db.chroma_db.settings.chroma_upsert_batch_size", 2)
    items = [
        {"chunk_id": f"c{i}", "vector": np.ones(3), "text": "t", "missing": None, "score": np.float32(0.5)}
        for i in range(3)
    ]
    chroma.upsert_items(chroma.text_index_name, items)

    calls = chroma.text_collection.upsert.call_args_list
    assert [len(c.kwargs["ids"]) for c in calls] == [2, 1]
    metadata = calls[0].kwargs["metadatas"][0]
    assert "missing" not in metadata and type(metadata["score"]) is float
    assert calls[0].kwargs["embeddings"][0] == [1.0, 1.0, 1.0]


def test_query_merges_modalities_and_skips_special_docs(chroma):
    scene = {"file_id": "f1", "scene_index": 2}
    chroma.text_collection.query.return_value = _query_result(
        (scene, 0.2, "scene text"),
        ({"file_id": "f1", "segment_index": 0}, 0.3, "spoken"),
        ({"file_id": "f1", "content_type": "narrative"}, 0.1, "story"),
        ({"file_id": "f1", "segment_index": 1}, 0.95, "noise"),
    )
    chroma.image_collection.query.return_value = _query_result((scene, 0.4, ""))

    results = chroma.query_index(np.ones(2), np.ones(2), {"user_id": "u1"}, {"top_k": 5, "threshold": 0.2})

    assert [r.get("scene_index", r.get("segment_index")) for r in results] == [2, 0]
    merged = results[0]
    assert merged["text_score"] == 0.8 and merged["image_score"] == 0.6
    assert merged["score"] == (0.8 * 0.5 + 0.6 * 0.5) / 2
    assert chroma.text_collection.query.call_args.kwargs["where"] == {"user_id": "u1"}


def test_visual_metadata_round_trips():
    description = SimpleNamespace(
        summary="A dog", objects=["dog"], setting="park", style="photo", colors=["green"], characters_present=[]
    )
    stored = visual_metadata(description)
    assert json.loads(stored["visual_objects"]) == ["dog"]
    assert parse_visual(stored) == {
        "summary": "A dog",
        "objects": ["dog"],
        "setting": "park",
        "style": "photo",
        "colors": ["green"],
    }
    assert visual_metadata(None) == {}
    assert parse_visual({"file_id": "f1"}) is None


def test_audio_segments_are_sorted_with_text(chroma):
    chroma.text_collection.get.return_value = {
        "ids": ["a", "b"],
        "metadatas": [{"segment_index": 1, "start_time": 5.0}, {"segment_index": 0, "start_time": 1.0}],
        "documents": ["second", "first"],
    }
    assert [s["text"] for s in chroma.audio_segments("f1")] == ["first", "second"]


def test_deletes_use_where_filters(chroma):
    chroma.delete_by_file_ids(["f1", "f2"])
    chroma.delete_by_user_id("u1")
    assert chroma.image_collection.delete.call_args_list[0].kwargs["where"] == {"file_id": {"$in": ["f1", "f2"]}}
    assert chroma.text_collection.delete.call_args_list[1].kwargs["where"] == {"user_id": "u1"}

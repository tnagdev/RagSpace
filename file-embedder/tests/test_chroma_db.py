import json
from types import SimpleNamespace

import numpy as np
import pytest

from src.db.chroma_db import RRF_K, parse_visual, visual_metadata


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


def test_query_fuses_modalities_by_rank_and_skips_special_docs(chroma):
    scene = {"file_id": "f1", "scene_index": 2}
    chroma.text_collection.query.return_value = _query_result(
        (scene, 0.2, "scene text"),
        ({"file_id": "f1", "segment_index": 0}, 0.3, "spoken"),
        ({"file_id": "f1", "content_type": "narrative"}, 0.1, "story"),
        ({"file_id": "f1", "segment_index": 1}, 0.95, "noise"),
    )
    chroma.image_collection.query.return_value = _query_result(
        ({**scene, "description_summary": "A beach"}, 0.7, "frame"),
    )

    results = chroma.query_index(np.ones(2), np.ones(2), {"user_id": "u1"}, {"top_k": 5, "threshold": 0.2})

    assert [r.get("scene_index", r.get("segment_index")) for r in results] == [2, 0]
    merged, spoken = results
    assert merged["text_score"] == 0.8 and merged["image_score"] == pytest.approx(0.3)
    assert merged["score"] == pytest.approx(1.0)
    assert merged["text"] == "scene text" and merged["description_summary"] == "A beach"
    assert spoken["score"] == pytest.approx(0.5 * (RRF_K + 1) / (RRF_K + 2))
    assert chroma.text_collection.query.call_args.kwargs["where"] == {"user_id": "u1"}
    assert chroma.text_collection.query.call_args.kwargs["n_results"] == 25


def test_raw_similarity_scales_do_not_decide_the_ranking(chroma):
    chroma.text_collection.query.return_value = _query_result(
        ({"file_id": "ocr", "scene_index": 0}, 0.3, "rr."),
        ({"file_id": "car", "scene_index": 4}, 0.45, "driving a red car"),
    )
    chroma.image_collection.query.return_value = _query_result(({"file_id": "car", "scene_index": 4}, 0.72, ""))

    results = chroma.query_index(np.ones(2), np.ones(2), None, {"top_k": 2})

    assert [r["file_id"] for r in results] == ["car", "ocr"]


def test_weights_scale_each_modality_and_zero_weight_is_not_queried(chroma):
    chroma.text_collection.query.return_value = _query_result(({"file_id": "f1", "segment_index": 0}, 0.1, "spoken"))

    results = chroma.query_index(np.ones(2), np.ones(2), None, {"text_weight": 0.8, "image_weight": 0.0})

    chroma.image_collection.query.assert_not_called()
    assert results[0]["score"] == pytest.approx(1.0)


def test_threshold_only_applies_to_dynamic_retrieval(chroma):
    chroma.text_collection.query.return_value = _query_result(
        ({"file_id": "f1", "segment_index": 0}, 0.9, "weak"),
        ({"file_id": "f1", "segment_index": 1}, 1.2, "opposite"),
    )

    results = chroma.query_index(np.ones(2), None, None, {"top_k": 3, "use_dynamic_retrieval": False})

    assert [r["text"] for r in results] == ["weak"]
    assert chroma.text_collection.query.call_args.kwargs["n_results"] == 3


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

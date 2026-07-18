"""
TC-001 to TC-016: ChromaDatabaseManager tests.
"""

import pytest
import numpy as np
from unittest.mock import MagicMock, patch, call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_items(n, index_name="text_embeddings", with_none_metadata=False, with_numpy=False):
    items = []
    for i in range(n):
        item = {
            "chunk_id": f"file-1#audio#{i}",
            "file_id": "file-1",
            "vector": [0.1] * 768,
            "text": f"segment {i}",
        }
        if with_none_metadata:
            item["nullable_field"] = None if i % 2 == 0 else "value"
        if with_numpy:
            item["np_float"] = np.float32(0.5)
            item["np_int"] = np.int64(42)
        items.append(item)
    return items


# ---------------------------------------------------------------------------
# TC-001: upsert skips when items list is empty
# ---------------------------------------------------------------------------

def test_upsert_empty_list(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    db.upsert_items("text_embeddings", [])
    text_col.upsert.assert_not_called()
    image_col.upsert.assert_not_called()


# ---------------------------------------------------------------------------
# TC-002: upsert unknown index name → no upsert, no exception
# ---------------------------------------------------------------------------

def test_upsert_unknown_index_name(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    db.upsert_items("unknown_index", _make_items(5))
    text_col.upsert.assert_not_called()
    image_col.upsert.assert_not_called()


# ---------------------------------------------------------------------------
# TC-003: 101 items → exactly 2 upsert calls (batches at 100)
# ---------------------------------------------------------------------------

def test_upsert_batches_at_100(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    db.upsert_items("text_embeddings", _make_items(101))
    assert text_col.upsert.call_count == 2


# ---------------------------------------------------------------------------
# TC-004: exactly 100 items → exactly 1 upsert call
# ---------------------------------------------------------------------------

def test_upsert_exactly_100(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    db.upsert_items("text_embeddings", _make_items(100))
    assert text_col.upsert.call_count == 1


# ---------------------------------------------------------------------------
# TC-005: None metadata values are stripped from the upsert call
# ---------------------------------------------------------------------------

def test_upsert_strips_none_metadata(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    items = _make_items(2, with_none_metadata=True)
    db.upsert_items("text_embeddings", items)

    called_metadatas = text_col.upsert.call_args[1]["metadatas"]
    for meta in called_metadatas:
        assert "nullable_field" not in meta or meta["nullable_field"] is not None, (
            "None values must be stripped from metadata"
        )


# ---------------------------------------------------------------------------
# TC-006: numpy scalars in metadata are converted to Python float
# ---------------------------------------------------------------------------

def test_upsert_converts_numpy_scalars(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    items = _make_items(1, with_numpy=True)
    db.upsert_items("text_embeddings", items)

    called_metadatas = text_col.upsert.call_args[1]["metadatas"]
    meta = called_metadatas[0]
    assert isinstance(meta["np_float"], float), "np.float32 should be converted to float"
    assert isinstance(meta["np_int"], float), "np.int64 should be converted to float"


# ---------------------------------------------------------------------------
# TC-007: image_embeddings index routes to image_collection, not text_collection
# ---------------------------------------------------------------------------

def test_upsert_routes_to_image_collection(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    items = [
        {
            "chunk_id": "file-1#image#0",
            "file_id": "file-1",
            "vector": [0.1] * 512,
            "text": "",
        }
    ]
    db.upsert_items("image_embeddings", items)
    image_col.upsert.assert_called_once()
    text_col.upsert.assert_not_called()


# ---------------------------------------------------------------------------
# TC-008: query_index filters out results below threshold
# ---------------------------------------------------------------------------

def test_query_filters_below_threshold(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    # distance=0.9 → score=0.1 which is below threshold=0.2
    text_col.query.return_value = {
        "ids": [["id-1"]],
        "metadatas": [[{"file_id": "file-1", "scene_index": 0}]],
        "distances": [[0.9]],
        "documents": [["text content"]],
    }

    results = db.query_index(
        text_query_vec=np.ones(768),
        options={"threshold": 0.2, "use_dynamic_retrieval": True, "top_k": 10},
    )
    assert results == [], f"Expected empty results, got {results}"


# ---------------------------------------------------------------------------
# TC-009: same key from text + image collections → single merged result
# ---------------------------------------------------------------------------

def test_query_merges_text_and_image_hits(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    shared_meta = {"file_id": "file-1", "scene_index": 2}

    text_col.query.return_value = {
        "ids": [["id-text"]],
        "metadatas": [[shared_meta]],
        "distances": [[0.2]],   # score = 0.8
        "documents": [["audio transcript"]],
    }
    image_col.query.return_value = {
        "ids": [["id-image"]],
        "metadatas": [[shared_meta]],
        "distances": [[0.3]],   # score = 0.7
        "documents": [[""]],
    }

    results = db.query_index(
        text_query_vec=np.ones(768),
        image_query_vec=np.ones(512),
        options={"threshold": 0.1, "use_dynamic_retrieval": True, "top_k": 10},
    )

    # Both hits share file_id + scene_index → should collapse to 1 result
    assert len(results) == 1


# ---------------------------------------------------------------------------
# TC-010: unimodal result: combined_score not penalised (divided by 1, not 2)
# ---------------------------------------------------------------------------

def test_query_combined_score_normalized_by_modality(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    # Only text query, score = 1 - 0.2 = 0.8, text_weight=1.0
    text_col.query.return_value = {
        "ids": [["id-1"]],
        "metadatas": [[{"file_id": "file-1", "scene_index": 0}]],
        "distances": [[0.2]],
        "documents": [["content"]],
    }

    results = db.query_index(
        text_query_vec=np.ones(768),
        options={
            "threshold": 0.1,
            "use_dynamic_retrieval": True,
            "top_k": 10,
            "text_weight": 1.0,
            "image_weight": 0.0,
        },
    )

    assert len(results) == 1
    # combined_score = 0.8 * 1.0 / 1 (only 1 modality) = 0.8
    # score key contains the final combined_score after pop
    assert abs(results[0]["score"] - 0.8) < 1e-6


# ---------------------------------------------------------------------------
# TC-011: confidence is never above 1.0 even with boosts
# ---------------------------------------------------------------------------

def test_query_confidence_capped_at_1(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    high_score_meta = {"file_id": "file-1", "scene_index": 0}

    text_col.query.return_value = {
        "ids": [["id-t"]],
        "metadatas": [[high_score_meta]],
        "distances": [[0.0]],   # perfect score = 1.0
        "documents": [["content"]],
    }
    image_col.query.return_value = {
        "ids": [["id-i"]],
        "metadatas": [[high_score_meta]],
        "distances": [[0.0]],
        "documents": [["content"]],
    }

    results = db.query_index(
        text_query_vec=np.ones(768),
        image_query_vec=np.ones(512),
        options={"threshold": 0.0, "use_dynamic_retrieval": True, "top_k": 10},
    )

    assert len(results) == 1
    assert results[0]["confidence"] <= 1.0


# ---------------------------------------------------------------------------
# TC-012: use_dynamic_retrieval=True fetches top_k * 5 candidates
# ---------------------------------------------------------------------------

def test_query_dynamic_retrieval_fetches_5x(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    text_col.query.return_value = {
        "ids": [[]],
        "metadatas": [[]],
        "distances": [[]],
        "documents": [[]],
    }

    TOP_K = 7
    db.query_index(
        text_query_vec=np.ones(768),
        options={"top_k": TOP_K, "use_dynamic_retrieval": True, "threshold": 0.0},
    )

    called_kwargs = text_col.query.call_args[1]
    assert called_kwargs["n_results"] == TOP_K * 5


# ---------------------------------------------------------------------------
# TC-013: text collection exception does not prevent image collection query
# ---------------------------------------------------------------------------

def test_query_collection_error_does_not_abort(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    text_col.query.side_effect = RuntimeError("text collection unavailable")
    image_col.query.return_value = {
        "ids": [["img-id"]],
        "metadatas": [[{"file_id": "file-1", "scene_index": 0}]],
        "distances": [[0.3]],
        "documents": [[""]],
    }

    results = db.query_index(
        text_query_vec=np.ones(768),
        image_query_vec=np.ones(512),
        options={"threshold": 0.1, "use_dynamic_retrieval": True, "top_k": 10},
    )

    image_col.query.assert_called_once()
    assert len(results) == 1


# ---------------------------------------------------------------------------
# TC-014: delete_by_file_ids with empty list → no-op
# ---------------------------------------------------------------------------

def test_delete_by_file_ids_empty_list(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db
    db.delete_by_file_ids([])
    text_col.get.assert_not_called()
    image_col.get.assert_not_called()


# ---------------------------------------------------------------------------
# TC-015: delete_by_file_ids calls delete on both collections
# ---------------------------------------------------------------------------

def test_delete_by_file_ids_removes_both_collections(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    text_col.get.return_value = {"ids": ["id-t1", "id-t2"], "metadatas": [], "documents": []}
    image_col.get.return_value = {"ids": ["id-i1"], "metadatas": [], "documents": []}

    db.delete_by_file_ids(["file-1", "file-2"])

    text_col.delete.assert_called_once_with(ids=["id-t1", "id-t2"])
    image_col.delete.assert_called_once_with(ids=["id-i1"])


# ---------------------------------------------------------------------------
# TC-016: delete_by_file_ids skips delete when collection.get returns no IDs
# ---------------------------------------------------------------------------

def test_delete_skips_delete_when_no_ids_found(mock_chroma_db):
    db, text_col, image_col = mock_chroma_db

    text_col.get.return_value = {"ids": [], "metadatas": [], "documents": []}
    image_col.get.return_value = {"ids": [], "metadatas": [], "documents": []}

    db.delete_by_file_ids(["file-1"])

    text_col.delete.assert_not_called()
    image_col.delete.assert_not_called()

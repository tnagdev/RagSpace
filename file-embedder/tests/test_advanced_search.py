"""
TC-044 to TC-045: advanced_search endpoint tests (via direct function calls).
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request_state(user_id="user-xyz"):
    """Return a fake FastAPI request with state populated."""
    state = MagicMock()
    state.user = {"id": user_id, "email": "test@example.com"}
    state.session = None
    request = MagicMock()
    request.state = state
    return request


def _make_query_request(
    query="red car",
    file_type=None,
    user_id=None,
    file_ids=None,
    enable_query_expansion=False,
):
    """Return a QueryRequest-like object."""
    req = MagicMock()
    req.query = query
    req.file_type = file_type
    req.user_id = user_id
    req.file_ids = file_ids
    req.top_k = 10
    req.text_weight = 0.5
    req.image_weight = 0.5
    req.threshold = 0.2
    req.use_dynamic_retrieval = True
    req.adaptive_scoring = True
    req.enable_query_expansion = enable_query_expansion
    req.use_enhanced = False
    return req


# ---------------------------------------------------------------------------
# TC-044: file_type + user_id together produce {"$and": [...]} filter
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_advanced_search_builds_and_filter():
    from src.routers.Search import advanced_search

    request = _make_request_state(user_id="user-xyz")
    body = _make_query_request(
        file_type="VIDEO",
        user_id="user-xyz",
        enable_query_expansion=False,
    )

    captured_filters = {}

    mock_retriever = MagicMock()

    def capture_retrieve(**kwargs):
        captured_filters.update({"filters": kwargs.get("filters")})
        return []

    mock_retriever.retrieve_with_multi_query.side_effect = capture_retrieve
    mock_retriever.get_retrieval_stats.return_value = {}

    mock_upload_manager = AsyncMock()
    mock_upload_manager.get_files_batch = AsyncMock(return_value={})

    mock_scene_detector = AsyncMock()
    mock_scene_detector.get_scenes_batch = AsyncMock(return_value={})

    with patch("src.routers.Search.AdvancedRetrieverService", return_value=mock_retriever), \
         patch("src.routers.Search.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.routers.Search.SceneDetectionService", return_value=mock_scene_detector), \
         patch("src.routers.Search.expand_query", return_value=["red car"]):

        response = await advanced_search(body=body, request=request)

    filters = captured_filters.get("filters")
    assert filters is not None, "Expected filters to be passed to retriever"

    # When both file_type and user_id are present we expect $and with two conditions
    assert "$and" in filters, f"Expected $and in filters, got: {filters}"

    # Verify both conditions are present
    conditions = filters["$and"]
    condition_keys = []
    for c in conditions:
        condition_keys.extend(c.keys())

    assert "file_type" in condition_keys, "Missing file_type condition"
    assert "user_id" in condition_keys, "Missing user_id condition"


# ---------------------------------------------------------------------------
# TC-045: results missing from upload-manager batch response are silently dropped
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_advanced_search_drops_results_missing_file_details():
    from src.routers.Search import advanced_search

    request = _make_request_state(user_id="user-xyz")
    body = _make_query_request(enable_query_expansion=False)

    # Two results from ChromaDB — only one is in upload-manager response
    mock_results = [
        {
            "file_id": "file-known",
            "file_type": "IMAGE",
            "scene_index": None,
            "segment_index": None,
            "start_time": None,
            "end_time": None,
            "start_frame": None,
            "end_frame": None,
            "text": "some text",
            "score": 0.8,
            "confidence": 0.9,
            "text_score": 0.8,
            "image_score": 0.0,
        },
        {
            "file_id": "file-unknown",   # ← not in upload-manager response
            "file_type": "IMAGE",
            "scene_index": None,
            "segment_index": None,
            "start_time": None,
            "end_time": None,
            "start_frame": None,
            "end_frame": None,
            "text": "other text",
            "score": 0.7,
            "confidence": 0.8,
            "text_score": 0.7,
            "image_score": 0.0,
        },
    ]

    mock_retriever = MagicMock()
    mock_retriever.retrieve_with_multi_query.return_value = mock_results
    mock_retriever.get_retrieval_stats.return_value = {}

    # Upload-manager only returns details for "file-known"
    mock_upload_manager = AsyncMock()
    mock_upload_manager.get_files_batch = AsyncMock(
        return_value={
            "file-known": {
                "id": "file-known",
                "originalFilename": "photo.jpg",
                "fileType": "IMAGE",
                "fileSize": 1024,
                "mimeType": "image/jpeg",
                "s3Url": None,
                "userId": "user-xyz",
                "thumbnailUrl": None,
                "thumbnailPath": None,
                "s3Key": "images/photo.jpg",
                "s3Bucket": "test-bucket",
                "youtubeUrl": None,
            }
        }
    )

    mock_scene_detector = AsyncMock()
    mock_scene_detector.get_scenes_batch = AsyncMock(return_value={})

    with patch("src.routers.Search.AdvancedRetrieverService", return_value=mock_retriever), \
         patch("src.routers.Search.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.routers.Search.SceneDetectionService", return_value=mock_scene_detector), \
         patch("src.routers.Search.expand_query", return_value=["red car"]):

        response = await advanced_search(body=body, request=request)

    # Only the result with file_details should be in the response
    assert response.total_results == 1
    assert response.results[0].file_id == "file-known"

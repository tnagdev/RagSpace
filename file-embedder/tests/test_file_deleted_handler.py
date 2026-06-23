"""
TC-036 to TC-039: file_deleted_handler tests.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ---------------------------------------------------------------------------
# TC-036: fileIds wins over fileId when both are present
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_handler_prefers_file_ids_over_file_id(make_deleted_event):
    from src.rabbitmq.handlers.file_deleted_handler import handle_file_deleted

    # Both fileId and fileIds present
    event = make_deleted_event(file_id="single-id", file_ids=["batch-id-1", "batch-id-2"])

    captured_ids = []

    mock_chroma = MagicMock()

    def capture_delete(file_ids):
        captured_ids.extend(file_ids)

    mock_chroma.delete_by_file_ids.side_effect = capture_delete

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"count": 0}

    mock_http_client = AsyncMock()
    mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_client.__aexit__ = AsyncMock(return_value=False)
    mock_http_client.post = AsyncMock(return_value=mock_response)

    with patch("src.rabbitmq.handlers.file_deleted_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("httpx.AsyncClient", return_value=mock_http_client):

        await handle_file_deleted(event)

    # Only the fileIds list should have been passed
    assert captured_ids == ["batch-id-1", "batch-id-2"]
    assert "single-id" not in captured_ids


# ---------------------------------------------------------------------------
# TC-037: single fileId is wrapped into a list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_handler_single_file_id_wrapped_in_list(make_deleted_event):
    from src.rabbitmq.handlers.file_deleted_handler import handle_file_deleted

    event = make_deleted_event(file_id="only-one-file", file_ids=None)

    captured_ids = []

    mock_chroma = MagicMock()
    mock_chroma.delete_by_file_ids.side_effect = lambda ids: captured_ids.extend(ids)

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"count": 0}

    mock_http_client = AsyncMock()
    mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_client.__aexit__ = AsyncMock(return_value=False)
    mock_http_client.post = AsyncMock(return_value=mock_response)

    with patch("src.rabbitmq.handlers.file_deleted_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("httpx.AsyncClient", return_value=mock_http_client):

        await handle_file_deleted(event)

    assert captured_ids == ["only-one-file"]


# ---------------------------------------------------------------------------
# TC-038: httpx error on chat-manager does not abort; ChromaDB cleanup still ran
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_handler_chat_manager_failure_does_not_abort(make_deleted_event):
    from src.rabbitmq.handlers.file_deleted_handler import handle_file_deleted

    event = make_deleted_event(file_id="file-abc", file_ids=None)

    mock_chroma = MagicMock()
    mock_chroma.delete_by_file_ids = MagicMock()

    mock_http_client = AsyncMock()
    mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
    mock_http_client.__aexit__ = AsyncMock(return_value=False)
    # httpx raises an error when posting to chat-manager
    mock_http_client.post = AsyncMock(side_effect=Exception("connection refused"))

    with patch("src.rabbitmq.handlers.file_deleted_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("httpx.AsyncClient", return_value=mock_http_client):

        # Must not raise
        await handle_file_deleted(event)

    # ChromaDB cleanup still happened
    mock_chroma.delete_by_file_ids.assert_called_once_with(["file-abc"])


# ---------------------------------------------------------------------------
# TC-039: empty event (no fileId, no fileIds) returns early without ChromaDB call
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_handler_empty_event_returns_early(make_deleted_event):
    from src.rabbitmq.handlers.file_deleted_handler import handle_file_deleted

    event = make_deleted_event(file_id=None, file_ids=None)

    mock_chroma = MagicMock()
    mock_chroma.delete_by_file_ids = MagicMock()

    with patch("src.rabbitmq.handlers.file_deleted_handler.ChromaDatabaseManager", return_value=mock_chroma):
        await handle_file_deleted(event)

    mock_chroma.delete_by_file_ids.assert_not_called()

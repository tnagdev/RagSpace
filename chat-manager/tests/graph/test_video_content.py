"""Tests for video_content_node."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from tests.graph.conftest import make_state


def _make_config(side_effects: list):
    """side_effects: list of return values or exceptions, one per get_video_content call."""
    svc = MagicMock()
    svc.get_video_content = AsyncMock(side_effect=side_effects)
    return {
        "configurable": {
            "correlation_id": "test-corr",
            "file_embedder_service": svc,
        }
    }


@pytest.mark.asyncio
async def test_retrieved_context_populated_for_single_file():
    """retrieved_context should contain the file's summary_context."""
    config = _make_config([{"summary_context": "A cat video.", "file_name": "cats.mp4"}])
    state = make_state(file_ids=["file-1"])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    assert "cats.mp4" in result["retrieved_context"]
    assert "A cat video." in result["retrieved_context"]


@pytest.mark.asyncio
async def test_retrieved_context_concatenated_for_multiple_files():
    """retrieved_context should concatenate content from all files."""
    config = _make_config([
        {"summary_context": "Cats summary.", "file_name": "cats.mp4"},
        {"summary_context": "Dogs summary.", "file_name": "dogs.mp4"},
    ])
    state = make_state(file_ids=["file-1", "file-2"])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    assert "Cats summary." in result["retrieved_context"]
    assert "Dogs summary." in result["retrieved_context"]


@pytest.mark.asyncio
async def test_empty_file_ids_returns_empty_context():
    """When file_ids is empty, retrieved_context should be empty string."""
    svc = MagicMock()
    svc.get_video_content = AsyncMock()
    config = {
        "configurable": {
            "correlation_id": "test-corr",
            "file_embedder_service": svc,
        }
    }
    state = make_state(file_ids=[])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    assert result["retrieved_context"] == ""
    svc.get_video_content.assert_not_called()


@pytest.mark.asyncio
async def test_none_file_ids_treated_as_empty():
    """When file_ids is None, node should not call get_video_content."""
    svc = MagicMock()
    svc.get_video_content = AsyncMock()
    config = {
        "configurable": {
            "correlation_id": "test-corr",
            "file_embedder_service": svc,
        }
    }
    state = make_state(file_ids=None)

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    assert result["retrieved_context"] == ""
    svc.get_video_content.assert_not_called()


@pytest.mark.asyncio
async def test_timeout_produces_status_timeout_event():
    """TimeoutError for a file should emit a tool_result with status='timeout'."""
    config = _make_config([asyncio.TimeoutError()])
    state = make_state(file_ids=["file-1"])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    tool_results = [e for e in result["sse_events"] if e["type"] == "tool_result"]
    assert any(r["status"] == "timeout" for r in tool_results)
    # Context should be empty since fetch failed
    assert result["retrieved_context"] == ""


@pytest.mark.asyncio
async def test_tools_used_includes_get_video_content():
    """tools_used should include 'get_video_content' after node runs."""
    config = _make_config([{"summary_context": "Data.", "file_name": "v.mp4"}])
    state = make_state(file_ids=["file-1"])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    assert "get_video_content" in result["tools_used"]


@pytest.mark.asyncio
async def test_step_start_and_step_done_emitted():
    """step_start and step_done SSE events must be emitted."""
    config = _make_config([{"summary_context": "Data.", "file_name": "v.mp4"}])
    state = make_state(file_ids=["file-1"])

    from src.graph.nodes.video_content import video_content_node
    result = await video_content_node(state, config)

    event_types = [e["type"] for e in result["sse_events"]]
    assert "step_start" in event_types
    assert "step_done" in event_types

"""Tests for video_search_node."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from tests.graph.conftest import make_state


def _make_config(search_response):
    """Build a config dict with a mocked FileEmbedderService."""
    svc = MagicMock()
    svc.search = AsyncMock(return_value=search_response)
    return {
        "configurable": {
            "correlation_id": "test-corr",
            "file_embedder_service": svc,
        }
    }


SAMPLE_RESULTS = [
    {
        "file_name": "cats.mp4",
        "file_details": {"originalFilename": "cats.mp4"},
        "text": "A cat playing with yarn.",
        "score": 0.92,
    },
    {
        "file_name": "dogs.mp4",
        "file_details": {"originalFilename": "dogs.mp4"},
        "text": "Dogs running in the park.",
        "score": 0.75,
    },
]


@pytest.mark.asyncio
async def test_search_results_and_retrieved_context_populated():
    """search_results and retrieved_context should be populated from service response."""
    config = _make_config({"results": SAMPLE_RESULTS})

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(make_state(), config)

    assert result["search_results"] == SAMPLE_RESULTS
    assert "cats.mp4" in result["retrieved_context"]
    assert "dogs.mp4" in result["retrieved_context"]
    assert "0.92" in result["retrieved_context"]


@pytest.mark.asyncio
async def test_tool_start_and_tool_result_events_emitted():
    """tool_start and tool_result SSE events must be emitted."""
    config = _make_config({"results": SAMPLE_RESULTS})

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(make_state(), config)

    event_types = [e["type"] for e in result["sse_events"]]
    assert "tool_start" in event_types
    assert "tool_result" in event_types


@pytest.mark.asyncio
async def test_timeout_handled_gracefully():
    """asyncio.TimeoutError from search should yield empty results without raising."""
    svc = MagicMock()
    svc.search = AsyncMock(side_effect=asyncio.TimeoutError())
    config = {
        "configurable": {
            "correlation_id": "test-corr",
            "file_embedder_service": svc,
        }
    }

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(make_state(), config)

    assert result["search_results"] == []
    assert result["retrieved_context"] == ""
    tool_result = next(e for e in result["sse_events"] if e["type"] == "tool_result")
    assert tool_result["count"] == 0
    assert "timed out" in tool_result["preview"]


@pytest.mark.asyncio
async def test_tools_used_updated():
    """tools_used list should include 'search_files' after running."""
    config = _make_config({"results": []})

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(make_state(), config)

    assert "search_files" in result["tools_used"]


@pytest.mark.asyncio
async def test_tools_used_accumulates_from_state():
    """tools_used should append to any already-present tools in state."""
    config = _make_config({"results": []})
    state = make_state(tools_used=["get_video_content"])

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(state, config)

    assert "get_video_content" in result["tools_used"]
    assert "search_files" in result["tools_used"]


@pytest.mark.asyncio
async def test_empty_results_produces_empty_context():
    """When service returns no results, retrieved_context should be empty."""
    config = _make_config({"results": []})

    from src.graph.nodes.video_search import video_search_node
    result = await video_search_node(make_state(), config)

    assert result["retrieved_context"] == ""
    assert result["search_results"] == []

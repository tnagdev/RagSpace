"""Tests for intent_classifier_node."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.graph.conftest import make_state, BASE_CONFIG


@pytest.fixture
def config():
    return {**BASE_CONFIG}


def _mock_llm_response(content: str):
    """Return a mock ChatOpenAI instance whose ainvoke returns content."""
    mock_response = MagicMock()
    mock_response.content = content
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    return mock_llm


@pytest.mark.asyncio
@pytest.mark.parametrize("intent", ["search", "summarize", "analyze", "generate", "converse"])
async def test_returns_correct_intent(intent, config):
    """Node should parse LLM JSON and return the correct intent."""
    payload = json.dumps({"intent": intent, "file_types": ["video"]})
    mock_llm = _mock_llm_response(payload)

    with patch("src.graph.nodes.intent_classifier.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node(make_state(), config)

    assert result["intent"] == intent
    assert result["file_types"] == ["video"]


@pytest.mark.asyncio
async def test_emits_step_start_and_step_done_events(config):
    """Node must emit step_start and step_done SSE events."""
    payload = json.dumps({"intent": "search", "file_types": ["video"]})
    mock_llm = _mock_llm_response(payload)

    with patch("src.graph.nodes.intent_classifier.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node(make_state(), config)

    event_types = [e["type"] for e in result["sse_events"]]
    assert "step_start" in event_types
    assert "step_done" in event_types

    start = next(e for e in result["sse_events"] if e["type"] == "step_start")
    done = next(e for e in result["sse_events"] if e["type"] == "step_done")
    assert start["step"] == "intent_classifier"
    assert done["step"] == "intent_classifier"


@pytest.mark.asyncio
async def test_falls_back_on_json_parse_failure(config):
    """Node must fall back to search/video when LLM returns invalid JSON."""
    mock_llm = _mock_llm_response("not valid json at all")

    with patch("src.graph.nodes.intent_classifier.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node(make_state(), config)

    assert result["intent"] == "search"
    assert result["file_types"] == ["video"]


@pytest.mark.asyncio
async def test_falls_back_on_llm_exception(config):
    """Node must fall back to search/video when LLM call raises."""
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(side_effect=Exception("network error"))

    with patch("src.graph.nodes.intent_classifier.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node(make_state(), config)

    assert result["intent"] == "search"
    assert result["file_types"] == ["video"]


@pytest.mark.asyncio
async def test_step_done_label_contains_intent(config):
    """step_done label should mention the detected intent."""
    payload = json.dumps({"intent": "analyze", "file_types": ["image"]})
    mock_llm = _mock_llm_response(payload)

    with patch("src.graph.nodes.intent_classifier.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node(make_state(), config)

    done = next(e for e in result["sse_events"] if e["type"] == "step_done")
    assert "analyze" in done["label"]

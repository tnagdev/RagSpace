"""Tests for response_synthesizer_node."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import AIMessageChunk

from tests.graph.conftest import make_state, BASE_CONFIG


def _make_streaming_llm(chunks: list[str]):
    """Return a mock ChatOpenAI that streams the given string chunks."""
    async def _astream(_messages):
        for text in chunks:
            chunk = AIMessageChunk(content=text)
            yield chunk

    mock_llm = MagicMock()
    mock_llm.astream = _astream
    return mock_llm


@pytest.mark.asyncio
async def test_content_events_emitted_per_chunk():
    """A 'content' SSE event should be emitted for each non-empty streaming chunk."""
    chunks = ["Hello", " world", "!"]
    mock_llm = _make_streaming_llm(chunks)

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(make_state(conversation_id="c1"), BASE_CONFIG)

    content_events = [e for e in result["sse_events"] if e["type"] == "content"]
    assert len(content_events) == 3
    assert content_events[0]["content"] == "Hello"
    assert content_events[1]["content"] == " world"
    assert content_events[2]["content"] == "!"


@pytest.mark.asyncio
async def test_done_event_emitted_last():
    """The last SSE event must be type='done'."""
    mock_llm = _make_streaming_llm(["response"])

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(make_state(conversation_id="c1"), BASE_CONFIG)

    assert result["sse_events"][-1]["type"] == "done"


@pytest.mark.asyncio
async def test_done_event_contains_tools_used():
    """done event should carry the tools_used list from state."""
    mock_llm = _make_streaming_llm(["ok"])
    state = make_state(conversation_id="c1", tools_used=["search_files"])

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(state, BASE_CONFIG)

    done = next(e for e in result["sse_events"] if e["type"] == "done")
    assert done["tools_used"] == ["search_files"]


@pytest.mark.asyncio
async def test_final_response_accumulated_correctly():
    """final_response should be the concatenation of all streamed chunks."""
    chunks = ["Part1", " Part2", " Part3"]
    mock_llm = _make_streaming_llm(chunks)

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(make_state(conversation_id="c1"), BASE_CONFIG)

    assert result["final_response"] == "Part1 Part2 Part3"


@pytest.mark.asyncio
async def test_step_start_emitted_before_content():
    """step_start should appear before any content events."""
    mock_llm = _make_streaming_llm(["hi"])

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(make_state(conversation_id="c1"), BASE_CONFIG)

    event_types = [e["type"] for e in result["sse_events"]]
    assert event_types[0] == "step_start"


@pytest.mark.asyncio
async def test_done_event_contains_conversation_id():
    """done event should carry the conversation_id."""
    mock_llm = _make_streaming_llm(["hi"])

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        result = await response_synthesizer_node(make_state(conversation_id="conv-xyz"), BASE_CONFIG)

    done = next(e for e in result["sse_events"] if e["type"] == "done")
    assert done["conversation_id"] == "conv-xyz"


@pytest.mark.asyncio
async def test_llm_exception_propagates():
    """If the LLM streaming raises, the node should re-raise."""
    async def _bad_astream(_messages):
        raise RuntimeError("LLM down")
        yield  # make it a generator

    mock_llm = MagicMock()
    mock_llm.astream = _bad_astream

    with patch("src.graph.nodes.response_synthesizer.ChatOpenAI", return_value=mock_llm):
        from src.graph.nodes.response_synthesizer import response_synthesizer_node
        with pytest.raises(RuntimeError, match="LLM down"):
            await response_synthesizer_node(make_state(conversation_id="c1"), BASE_CONFIG)

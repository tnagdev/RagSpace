"""Tests for AgentState TypedDict structure and add_messages reducer."""
import pytest
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph.message import add_messages

from src.graph.state import AgentState


def test_agent_state_has_expected_keys():
    """AgentState TypedDict should define all required keys."""
    required_keys = {
        "user_message",
        "conversation_id",
        "user_id",
        "file_ids",
        "conversation_history",
        "conversation_summary",
        "intent",
        "file_types",
        "search_results",
        "tool_outputs",
        "retrieved_context",
        "messages",
        "final_response",
        "tools_used",
        "sse_events",
    }
    annotations = AgentState.__annotations__
    assert required_keys.issubset(set(annotations.keys()))


def test_agent_state_messages_field_uses_add_messages_reducer():
    """The 'messages' field annotation should use the add_messages reducer."""
    from typing import get_type_hints, get_args, Annotated
    hints = get_type_hints(AgentState, include_extras=True)
    messages_hint = hints["messages"]
    # get_args returns (list[BaseMessage], add_messages) for Annotated types
    args = get_args(messages_hint)
    assert len(args) == 2, "messages must be Annotated[list[BaseMessage], add_messages]"
    assert args[1] is add_messages


def test_add_messages_reducer_appends():
    """add_messages reducer should append new messages to the existing list."""
    existing = [HumanMessage(content="hello")]
    new_msg = AIMessage(content="world")
    result = add_messages(existing, [new_msg])
    assert len(result) == 2
    assert result[0].content == "hello"
    assert result[1].content == "world"


def test_add_messages_reducer_handles_empty_existing():
    """add_messages reducer should work with an empty existing list."""
    result = add_messages([], [HumanMessage(content="hi")])
    assert len(result) == 1
    assert result[0].content == "hi"


def test_agent_state_instantiation():
    """AgentState dict should accept all expected field values."""
    state: AgentState = {
        "user_message": "test",
        "conversation_id": "c1",
        "user_id": "u1",
        "file_ids": ["f1"],
        "conversation_history": [{"role": "user", "content": "hi"}],
        "conversation_summary": "summary",
        "intent": "search",
        "file_types": ["video"],
        "search_results": [{"score": 0.9}],
        "tool_outputs": [],
        "retrieved_context": "some context",
        "messages": [],
        "final_response": "answer",
        "tools_used": ["search_files"],
        "sse_events": [{"type": "step_start"}],
    }
    # TypedDict is just a dict at runtime — verify keys present
    assert state["intent"] == "search"
    assert state["tools_used"] == ["search_files"]

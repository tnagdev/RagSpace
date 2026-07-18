"""Shared fixtures for graph tests."""
import os
import pytest

# Patch settings before any src imports
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("FILE_EMBEDDER_URL", "http://localhost:8004")
os.environ.setdefault("UPLOAD_MANAGER_URL", "http://localhost:8002")
os.environ.setdefault("SCENE_DETECTOR_URL", "http://localhost:8003")
os.environ.setdefault("NVIDIA_API_KEY", "test-key")


BASE_CONFIG = {
    "configurable": {
        "correlation_id": "test-corr-id",
        "thread_id": "test-thread",
    }
}


def make_state(**overrides) -> dict:
    """Return a minimal valid AgentState dict."""
    base = {
        "user_message": "find me cat videos",
        "conversation_id": "conv-123",
        "user_id": "user-abc",
        "file_ids": None,
        "conversation_history": [],
        "conversation_summary": None,
        "intent": None,
        "file_types": None,
        "search_results": None,
        "tool_outputs": None,
        "retrieved_context": None,
        "messages": [],
        "final_response": None,
        "tools_used": [],
        "sse_events": [],
    }
    base.update(overrides)
    return base

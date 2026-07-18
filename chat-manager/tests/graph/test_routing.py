"""Tests for the graph routing logic (_route_after_intent).

We test the routing function directly rather than compiling the full graph
(which needs a Postgres checkpointer). This is safe because the routing
function is a pure, deterministic function of state.

The orchestrator imports langgraph.checkpoint.postgres (only available with a
live Postgres install). We stub that out via sys.modules before importing, so
no DB connection is needed.
"""
import sys
import types
import pytest
from unittest.mock import MagicMock

from tests.graph.conftest import make_state


def _stub_postgres_checkpoint():
    """Insert stub modules so orchestrator can be imported without psycopg/postgres."""
    # langgraph.checkpoint is already present; add the postgres sub-package
    pkg = types.ModuleType("langgraph.checkpoint.postgres")
    pkg_aio = types.ModuleType("langgraph.checkpoint.postgres.aio")
    pkg_aio.AsyncPostgresSaver = MagicMock()

    sys.modules.setdefault("langgraph.checkpoint.postgres", pkg)
    sys.modules.setdefault("langgraph.checkpoint.postgres.aio", pkg_aio)

    # Also stub psycopg_pool if not installed
    if "psycopg_pool" not in sys.modules:
        pool_mod = types.ModuleType("psycopg_pool")
        pool_mod.AsyncConnectionPool = MagicMock()
        sys.modules["psycopg_pool"] = pool_mod


_stub_postgres_checkpoint()

# Now safe to import the orchestrator
from src.graph.orchestrator import _route_after_intent, _build_graph  # noqa: E402


@pytest.mark.parametrize("intent,expected_node", [
    ("converse", "synthesize"),
    ("summarize", "video_content"),
    ("search", "video_search"),
    ("analyze", "video_search"),
    ("generate", "video_search"),
])
def test_route_after_intent(intent, expected_node):
    """Each intent value should route to the correct next node."""
    state = make_state(intent=intent)
    assert _route_after_intent(state) == expected_node


def test_route_defaults_to_video_search_when_intent_is_none():
    """Missing/None intent should default to video_search."""
    state = make_state(intent=None)
    assert _route_after_intent(state) == "video_search"


def test_route_defaults_to_video_search_for_unknown_intent():
    """Unknown intent strings should fall back to video_search."""
    state = make_state(intent="unknown_intent_xyz")
    assert _route_after_intent(state) == "video_search"


def test_graph_builder_compiles_without_checkpointer():
    """_build_graph() should produce a StateGraph that compiles with MemorySaver."""
    from langgraph.checkpoint.memory import MemorySaver

    checkpointer = MemorySaver()
    graph = _build_graph().compile(checkpointer=checkpointer)
    assert hasattr(graph, "get_graph")


def test_graph_contains_expected_nodes():
    """Compiled graph should include all four nodes."""
    from langgraph.checkpoint.memory import MemorySaver

    graph = _build_graph().compile(checkpointer=MemorySaver())
    node_names = set(graph.get_graph().nodes.keys())
    assert "intent_classifier" in node_names
    assert "video_search" in node_names
    assert "video_content" in node_names
    assert "synthesize" in node_names

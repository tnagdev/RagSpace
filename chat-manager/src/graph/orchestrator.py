import asyncio
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from .state import AgentState
from .nodes.fetch_context import fetch_context_node
from .nodes.intent_classifier import intent_classifier_node
from .nodes.video_search import video_search_node
from .nodes.video_content import video_content_node
from .nodes.response_synthesizer import response_synthesizer_node


def _route_after_intent(state: AgentState) -> str:
    intent = state.get("intent") or "search"
    if intent == "converse":
        return "synthesize"
    if intent == "summarize":
        return "video_content"
    return "video_search"


def _build_graph() -> StateGraph:
    builder = StateGraph(AgentState)
    builder.add_node("fetch_context", fetch_context_node)
    builder.add_node("intent_classifier", intent_classifier_node)
    builder.add_node("video_search", video_search_node)
    builder.add_node("video_content", video_content_node)
    builder.add_node("synthesize", response_synthesizer_node)
    builder.set_entry_point("fetch_context")
    builder.add_edge("fetch_context", "intent_classifier")
    builder.add_conditional_edges("intent_classifier", _route_after_intent, {
        "video_search": "video_search",
        "video_content": "video_content",
        "synthesize": "synthesize",
    })
    builder.add_edge("video_search", "synthesize")
    builder.add_edge("video_content", "synthesize")
    builder.add_edge("synthesize", END)
    return builder


_pool: AsyncConnectionPool | None = None
compiled_graph = None


def _strip_prisma_schema_param(url: str) -> str:
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params.pop("schema", None)
    new_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=new_query))


async def init_graph(database_url: str):
    global _pool, compiled_graph
    import psycopg
    pg_url = _strip_prisma_schema_param(database_url)
    async with await psycopg.AsyncConnection.connect(pg_url, autocommit=True) as setup_conn:
        await AsyncPostgresSaver(setup_conn).setup()
    _pool = AsyncConnectionPool(pg_url, open=False)
    await _pool.open()
    checkpointer = AsyncPostgresSaver(_pool)
    compiled_graph = _build_graph().compile(checkpointer=checkpointer)


async def close_graph():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None

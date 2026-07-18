import asyncio
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from .state import AgentState
from .nodes.fetch_context import fetch_context_node
from .nodes.intent_classifier import intent_classifier_node
from .nodes.video_search import video_search_node
from .nodes.video_content import video_content_node
from .nodes.image_content import image_content_node
from .nodes.response_synthesizer import response_synthesizer_node


def _file_type_buckets(state: AgentState) -> tuple[list[str], list[str]]:
    """Split state['file_ids'] into (video_ids, image_ids) using ground-truth
    attached_files (real DB fileType from fetch_context_node), not the dead
    LLM-guessed intent_classifier.file_types field. Anything not IMAGE is
    treated as the video path (VIDEO, YOUTUBE_VIDEO, AUDIO, DOCUMENT, OTHER, or
    unresolvable) — preserves today's behavior for every non-image type."""
    attached = state.get("attached_files") or []
    by_id = {f.get("id"): (f.get("fileType") or "").upper() for f in attached}
    file_ids = state.get("file_ids") or []
    image_ids = [fid for fid in file_ids if by_id.get(fid) == "IMAGE"]
    video_ids = [fid for fid in file_ids if by_id.get(fid) != "IMAGE"]
    return video_ids, image_ids


async def content_dispatch_node(state: AgentState, config) -> dict:
    """Routes the 'summarize' intent by file-type composition. Pure-video (or
    unresolvable) attachments go to the UNCHANGED video_content_node exactly as
    today. Pure-image attachments go to image_content_node. Mixed attachments
    call both as plain async functions with a file_ids-scoped state copy each
    and merge the results here — AgentState has no reducer defined for
    retrieved_context/search_results/tools_used, so a true LangGraph parallel
    fan-out would silently drop one branch's contribution via last-write-wins."""
    video_ids, image_ids = _file_type_buckets(state)

    if not image_ids:
        return await video_content_node(state, config)

    if not video_ids:
        return await image_content_node(state, config)

    video_state = {**state, "file_ids": video_ids}
    image_state = {**state, "file_ids": image_ids}
    video_result, image_result = await asyncio.gather(
        video_content_node(video_state, config),
        image_content_node(image_state, config),
    )
    merged_context = "\n\n".join(filter(None, [
        video_result.get("retrieved_context"), image_result.get("retrieved_context"),
    ]))
    merged_search_results = (video_result.get("search_results") or []) + (image_result.get("search_results") or [])
    merged_tools = list(dict.fromkeys(
        (video_result.get("tools_used") or []) + (image_result.get("tools_used") or [])
    ))
    merged_sse = (video_result.get("sse_events") or []) + (image_result.get("sse_events") or [])
    return {
        "retrieved_context": merged_context,
        "search_results": merged_search_results or None,
        "tools_used": merged_tools,
        "sse_events": merged_sse,
    }


def _route_after_intent(state: AgentState) -> str:
    intent = state.get("intent") or "search"
    if intent == "converse":
        return "synthesize"
    if intent == "summarize":
        return "content_dispatch"
    # Multiple explicitly-attached files: always fetch each file's full content
    # (every video scene, full image metadata) instead of running a semantic
    # search. A search ranks matches across all attached files combined, so it
    # can return a lopsided slice — e.g. 7 hits from one video and 1 from
    # another — leaving the LLM to fill the gaps with fabricated detail for the
    # under-represented files. Single-attachment and no-attachment (library-wide)
    # queries are unaffected and keep the existing targeted search.
    file_ids = state.get("file_ids") or []
    if len(file_ids) > 1:
        return "content_dispatch"
    return "video_search"


def _build_graph() -> StateGraph:
    builder = StateGraph(AgentState)
    builder.add_node("fetch_context", fetch_context_node)
    builder.add_node("intent_classifier", intent_classifier_node)
    builder.add_node("video_search", video_search_node)
    builder.add_node("content_dispatch", content_dispatch_node)
    builder.add_node("synthesize", response_synthesizer_node)
    builder.set_entry_point("fetch_context")
    builder.add_edge("fetch_context", "intent_classifier")
    builder.add_conditional_edges("intent_classifier", _route_after_intent, {
        "video_search": "video_search",
        "content_dispatch": "content_dispatch",
        "synthesize": "synthesize",
    })
    builder.add_edge("video_search", "synthesize")
    builder.add_edge("content_dispatch", "synthesize")
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

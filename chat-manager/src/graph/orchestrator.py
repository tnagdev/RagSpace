import asyncio

from langgraph.graph import END, StateGraph
from ragspace.common.v1 import common_pb2

from src.graph.nodes.fetch_context import fetch_context_node
from src.graph.nodes.file_content import image_content_node, video_content_node
from src.graph.nodes.intent_classifier import intent_classifier_node
from src.graph.nodes.response_synthesizer import response_synthesizer_node
from src.graph.nodes.video_search import video_search_node
from src.graph.state import AgentState

# Reading every attached file in full only scales to a handful; larger scopes fall back to search.
MAX_CONTENT_FILES = 5


def _file_type_buckets(state: AgentState) -> tuple[list[str], list[str]]:
    """Splits attachments by their stored type; anything not an image takes the video path."""
    types = {f.id: f.type for f in state.get("attached_files") or []}
    image_ids = [fid for fid in state["file_ids"] if types.get(fid) == common_pb2.FILE_TYPE_IMAGE]
    video_ids = [fid for fid in state["file_ids"] if types.get(fid) != common_pb2.FILE_TYPE_IMAGE]
    return video_ids, image_ids


async def content_dispatch_node(state: AgentState, config) -> dict:
    video_ids, image_ids = _file_type_buckets(state)
    if not image_ids:
        return await video_content_node(state, config)
    if not video_ids:
        return await image_content_node(state, config)

    # Called directly rather than as parallel graph branches: the state has no reducers, so
    # fan-out would keep only one branch's context and hits.
    video, image = await asyncio.gather(
        video_content_node({**state, "file_ids": video_ids}, config),
        image_content_node({**state, "file_ids": image_ids}, config),
    )
    return {
        "retrieved_context": "\n\n".join(filter(None, [video["retrieved_context"], image["retrieved_context"]])),
        "search_results": video["search_results"] + image["search_results"],
        "tools_used": list(dict.fromkeys(video["tools_used"] + image["tools_used"])),
        "events": video["events"] + image["events"],
    }


def _route_after_intent(state: AgentState) -> str:
    intent = state.get("intent") or "search"
    if intent == "converse":
        return "synthesize"
    file_count = len(state["file_ids"])
    if not file_count or file_count > MAX_CONTENT_FILES:
        return "video_search"
    # Several attachments read in full: a ranked search across them can return a lopsided slice,
    # leaving the model to invent detail for the under-represented files.
    if intent == "summarize" or file_count > 1:
        return "content_dispatch"
    return "video_search"


def build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("fetch_context", fetch_context_node)
    builder.add_node("intent_classifier", intent_classifier_node)
    builder.add_node("video_search", video_search_node)
    builder.add_node("content_dispatch", content_dispatch_node)
    builder.add_node("synthesize", response_synthesizer_node)
    builder.set_entry_point("fetch_context")
    builder.add_edge("fetch_context", "intent_classifier")
    builder.add_conditional_edges(
        "intent_classifier",
        _route_after_intent,
        {"video_search": "video_search", "content_dispatch": "content_dispatch", "synthesize": "synthesize"},
    )
    builder.add_edge("video_search", "synthesize")
    builder.add_edge("content_dispatch", "synthesize")
    builder.add_edge("synthesize", END)
    return builder.compile()


graph = build_graph()

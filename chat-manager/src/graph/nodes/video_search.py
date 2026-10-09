import json
import logging

import grpc
from langchain_core.runnables import RunnableConfig
from ragspace.search.v1 import search_pb2

from src.clients import search_client
from src.config import settings
from src.graph.events import results, step_done, step_failed, step_started, tool_done, tool_started
from src.graph.formatters import format_search_results_for_llm
from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger

logger = logging.getLogger(__name__)

# Visual queries lean on CLIP image similarity; dialogue and story queries on transcript text.
MODALITY_WEIGHTS: dict[str, tuple[float, float]] = {
    "visual": (0.25, 0.75),
    "audio": (0.95, 0.05),
    "thematic": (0.80, 0.20),
    "character": (0.75, 0.25),
    "both": (0.50, 0.50),
}


def error_code(error: grpc.aio.AioRpcError) -> str:
    return "TIMEOUT" if error.code() == grpc.StatusCode.DEADLINE_EXCEEDED else "SERVICE_ERROR"


async def video_search_node(state: AgentState, config: RunnableConfig) -> dict:
    query = state["user_message"]
    modality = state.get("query_modality") or "both"
    text_weight, image_weight = MODALITY_WEIGHTS.get(modality, MODALITY_WEIGHTS["both"])
    log = NodeLogger(logger, "video_search")
    tools_used = state.get("tools_used", []) + ["search_files"]
    events = [
        step_started("video_search", "Searching your videos..."),
        tool_started("search_files", {"query": query}),
    ]

    request = search_pb2.SearchRequest(
        user_id=state["user_id"],
        query=query,
        file_ids=state["file_ids"],
        limit=25 if modality in ("thematic", "both", "audio") else 15,
    )
    request.tuning.text_weight = text_weight
    request.tuning.image_weight = image_weight
    client = search_client()
    try:
        response = await client.stub.Search(request, **client.opts(timeout_s=settings.video_search_timeout))
    except grpc.aio.AioRpcError as error:
        log.error("search_failed", code=error.code().name)
        events += [
            step_failed("video_search", "Search failed", error_code(error)),
            tool_done("search_files", 0),
            step_done("video_search", "Search failed"),
        ]
        return {"search_results": [], "retrieved_context": "", "tools_used": tools_used, "events": events}

    hits = list(response.hits)[: settings.video_search_display_limit]
    hits.sort(key=lambda h: (h.file_id, h.start_seconds))
    events += [
        tool_done("search_files", len(hits)),
        results("search", hits),
        step_done("video_search", f"Found {len(hits)} results"),
    ]
    log.done(results=len(hits), modality=modality)
    return {
        "search_results": hits,
        "retrieved_context": json.dumps(format_search_results_for_llm(hits), indent=2),
        "tools_used": tools_used,
        "events": events,
    }

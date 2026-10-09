import json
import logging
from typing import Any, Callable

import grpc
from langchain_core.runnables import RunnableConfig
from ragspace.search.v1 import search_pb2

from src.clients import search_client
from src.config import settings
from src.graph.events import results, step_done, step_failed, step_started, tool_done, tool_started
from src.graph.formatters import format_file_content_for_llm, format_video_content_for_llm, hit_from_content
from src.graph.nodes.video_search import error_code
from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger

logger = logging.getLogger(__name__)

SCENE_THUMBNAIL_LIMIT = 20


async def _fetch_contents(
    state: AgentState,
    step: str,
    tool: str,
    format_content: Callable[[search_pb2.GetFileContentResponse], dict[str, Any]],
    log: NodeLogger,
) -> tuple[list[str], list[search_pb2.GetFileContentResponse], list[dict]]:
    client = search_client()
    parts, contents, events = [], [], []
    for file_id in state["file_ids"]:
        events.append(tool_started(tool, {"file_id": file_id}))
        try:
            content = await client.stub.GetFileContent(
                search_pb2.GetFileContentRequest(
                    user_id=state["user_id"], file_id=file_id, include_visual_metadata=True
                ),
                **client.opts(timeout_s=settings.video_content_timeout),
            )
        except grpc.aio.AioRpcError as error:
            log.error("content_failed", file_id=file_id, code=error.code().name)
            events += [step_failed(step, f"Could not read {file_id}", error_code(error)), tool_done(tool, 0)]
            continue
        parts.append(json.dumps(format_content(content), indent=2))
        contents.append(content)
        events.append(tool_done(tool, 1))
    return parts, contents, events


async def video_content_node(state: AgentState, config: RunnableConfig) -> dict:
    log = NodeLogger(logger, "video_content")
    events = [step_started("video_content", "Reading video content...")]
    parts, _, fetch_events = await _fetch_contents(
        state, "video_content", "get_video_content", format_video_content_for_llm, log
    )
    events += fetch_events
    events.append(step_done("video_content", f"Retrieved content for {len(parts)} video(s)"))

    events.append(step_started("scene_thumbnails", "Loading scene thumbnails..."))
    hits = []
    client = search_client()
    try:
        response = await client.stub.Search(
            search_pb2.SearchRequest(
                user_id=state["user_id"],
                query=state["user_message"] or "video scene",
                file_ids=state["file_ids"],
                limit=SCENE_THUMBNAIL_LIMIT,
            ),
            **client.opts(timeout_s=settings.scene_thumbnail_timeout),
        )
        hits = list(response.hits)
    except grpc.aio.AioRpcError as error:
        log.error("thumbnails_failed", code=error.code().name)
    events += [
        results("scene_thumbnails", hits),
        step_done("scene_thumbnails", f"Loaded {len(hits)} scene thumbnails"),
    ]
    log.done(files=len(parts), thumbnails=len(hits))
    return {
        "retrieved_context": "\n\n".join(parts),
        "search_results": hits,
        "tools_used": state.get("tools_used", []) + ["get_video_content"],
        "events": events,
    }


async def image_content_node(state: AgentState, config: RunnableConfig) -> dict:
    log = NodeLogger(logger, "image_content")
    events = [step_started("image_content", "Reading image content...")]
    parts, contents, fetch_events = await _fetch_contents(
        state, "image_content", "get_file_content", format_file_content_for_llm, log
    )
    hits = [hit_from_content(content) for content in contents]
    events += fetch_events
    events += [
        step_done("image_content", f"Retrieved content for {len(parts)} image(s)"),
        results("scene_thumbnails", hits),
    ]
    log.done(files=len(parts))
    return {
        "retrieved_context": "\n\n".join(parts),
        "search_results": hits,
        "tools_used": state.get("tools_used", []) + ["get_file_content"],
        "events": events,
    }

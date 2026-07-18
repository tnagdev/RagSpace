import asyncio
import json
import logging
from langchain_core.runnables import RunnableConfig

from src.config import settings
from src.graph.state import AgentState
from src.graph.formatters import format_video_content_for_llm
from src.graph.utilities.metadata_service import fetch_metadata_maps, sign_s3_urls_inplace
from src.logging.node_logger import NodeLogger

logger = logging.getLogger(__name__)


async def video_content_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    file_embedder_service = config["configurable"]["file_embedder_service"]
    upload_manager_service = config["configurable"].get("upload_manager_service")
    s3_service = config["configurable"].get("s3_service")

    user_id = state["user_id"]
    user_message = state.get("user_message", "")
    file_ids = state.get("file_ids") or []

    log = NodeLogger(logger, correlation_id, "video_content")
    log.info("start", file_count=len(file_ids))

    sse_events = [{"type": "step_start", "step": "video_content", "label": "Reading video content..."}]
    combined_parts: list[str] = []

    for fid in file_ids:
        log.info("fetching", file_id=fid)
        sse_events.append({"type": "tool_start", "tool": "get_video_content", "arguments": {"file_id": fid}})
        try:
            content_response = await asyncio.wait_for(
                file_embedder_service.get_video_content(file_id=fid, include_metadata=True),
                timeout=settings.video_content_timeout,
            )
            formatted = format_video_content_for_llm(content_response)
            chunk = json.dumps(formatted, indent=2)
            combined_parts.append(chunk)
            log.info("fetched", file_id=fid, context_chars=len(chunk))
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "ok"})
        except asyncio.TimeoutError:
            log.error("timeout", file_id=fid, timeout_s=settings.video_content_timeout)
            sse_events.append({
                "type": "step_error",
                "step": "video_content",
                "error": f"Timed out fetching content for {fid}",
                "error_code": "TIMEOUT",
            })
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "timeout"})
        except Exception as e:
            log.error("fetch_failed", file_id=fid, exc_info=True, error=str(e)[:120])
            sse_events.append({
                "type": "step_error",
                "step": "video_content",
                "error": f"Error fetching content for {fid}: {e}",
                "error_code": "SERVICE_ERROR",
            })
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "error"})

    combined_context = "\n\n".join(combined_parts)
    sse_events.append({
        "type": "step_done",
        "step": "video_content",
        "label": f"Retrieved content for {len(file_ids)} video(s)",
    })

    # Fetch scene thumbnails so the frontend can render clickable scene cards.
    search_results: list[dict] = []
    if file_ids:
        sse_events.append({"type": "step_start", "step": "scene_thumbnails", "label": "Loading scene thumbnails..."})
        try:
            search_response = await asyncio.wait_for(
                file_embedder_service.search(
                    query=user_message or "video scene",
                    user_id=user_id,
                    file_ids=file_ids,
                    max_results=20,
                    use_dynamic_retrieval=True,
                    adaptive_scoring=True,
                    enable_query_expansion=True,
                    use_enhanced=True,
                ),
                timeout=settings.scene_thumbnail_timeout,
            )
            raw_results = search_response.get("results", []) if search_response else []
            if not raw_results:
                log.warning("thumbnail_search_empty", file_ids=file_ids, query=user_message[:60])

            scene_metadata_map, file_metadata_map = await fetch_metadata_maps(
                upload_manager_service, raw_results, correlation_id
            )

            for r in raw_results:
                file_details = r.get("file_details") or {}
                scene_details = r.get("scene_details") or {}
                file_id = r.get("file_id", "")
                scene_id = r.get("scene_id")

                metadata = (
                    scene_metadata_map.get(scene_id)
                    if scene_id
                    else file_metadata_map.get(file_id)
                )

                search_results.append({
                    "file_id": file_id,
                    "scene_id": scene_id,
                    "file_name": file_details.get("fileName") or r.get("file_name", "Unknown"),
                    "file_type": file_details.get("fileType"),
                    "score": r.get("score", 0.0),
                    "thumbnail_s3_key": scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath"),
                    "thumbnail_s3_bucket": file_details.get("s3Bucket"),
                    "file_s3_key": file_details.get("s3Key"),
                    "file_s3_bucket": file_details.get("s3Bucket"),
                    "thumbnail_url": scene_details.get("thumbnailUrl") or file_details.get("thumbnailUrl"),
                    "file_url": file_details.get("url"),
                    "youtube_url": file_details.get("youtubeUrl"),
                    "start_time": scene_details.get("startTime") or r.get("start_time"),
                    "end_time": scene_details.get("endTime") or r.get("end_time"),
                    "text_content": r.get("text", ""),
                    "description": metadata.get("summary") if metadata else None,
                })

            await sign_s3_urls_inplace(s3_service, search_results, correlation_id)
            log.info("thumbnails", count=len(search_results))

        except asyncio.TimeoutError:
            log.error("thumbnail_timeout", timeout_s=settings.scene_thumbnail_timeout)
        except Exception as e:
            log.error("thumbnail_failed", exc_info=True, error=str(e)[:120])

        sse_events.append({
            "type": "scene_thumbnails",
            "scenes": search_results,
            "count": len(search_results),
        })
        sse_events.append({
            "type": "step_done",
            "step": "scene_thumbnails",
            "label": f"Loaded {len(search_results)} scene thumbnails",
        })

    log.done(
        files=len(file_ids),
        context_chars=len(combined_context),
        thumbnails=len(search_results),
    )

    return {
        "retrieved_context": combined_context,
        "search_results": search_results or None,
        "tools_used": state.get("tools_used", []) + ["get_video_content"],
        "sse_events": sse_events,
    }

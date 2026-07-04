import asyncio
import json
import logging
from langchain_core.runnables import RunnableConfig

from src.graph.state import AgentState
from src.graph.formatters import format_video_content_for_llm, format_search_results_for_llm

logger = logging.getLogger(__name__)


async def video_content_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    file_embedder_service = config["configurable"]["file_embedder_service"]
    upload_manager_service = config["configurable"].get("upload_manager_service")
    s3_service = config["configurable"].get("s3_service")

    user_id = state["user_id"]
    user_message = state.get("user_message", "")
    file_ids = state.get("file_ids") or []

    logger.info(f"[{correlation_id}] video_content_node: fetching content for {len(file_ids)} file(s)")

    sse_events = [{"type": "step_start", "step": "video_content", "label": "Reading video content..."}]

    combined_parts = []

    for fid in file_ids:
        sse_events.append({"type": "tool_start", "tool": "get_video_content", "arguments": {"file_id": fid}})
        try:
            content_response = await asyncio.wait_for(
                file_embedder_service.get_video_content(file_id=fid, include_metadata=True),
                timeout=60.0
            )
            formatted = format_video_content_for_llm(content_response)
            combined_parts.append(json.dumps(formatted, indent=2))
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "ok"})
        except asyncio.TimeoutError:
            logger.error(f"[{correlation_id}] video_content_node: timed out for {fid}")
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "timeout"})
        except Exception as e:
            logger.error(f"[{correlation_id}] video_content_node: error for {fid}: {e}")
            sse_events.append({"type": "tool_result", "tool": "get_video_content", "file_id": fid, "status": "error"})

    combined_context = "\n\n".join(combined_parts)
    sse_events.append({
        "type": "step_done",
        "step": "video_content",
        "label": f"Retrieved content for {len(file_ids)} video(s)"
    })

    # Also search for scene thumbnails so the frontend can show clickable scene cards
    search_results = []
    if file_ids:
        sse_events.append({"type": "step_start", "step": "scene_thumbnails", "label": "Loading scene thumbnails..."})
        try:
            search_response = await asyncio.wait_for(
                file_embedder_service.search(
                    query=f"video scene content {user_message[:60]}".strip(),
                    user_id=user_id,
                    file_ids=file_ids,
                    max_results=20,
                    use_dynamic_retrieval=False,
                    adaptive_scoring=True,
                    enable_query_expansion=False,
                    use_enhanced=False,
                ),
                timeout=20.0
            )
            raw_results = search_response.get("results", []) if search_response else []

            # Bulk-fetch metadata
            scene_ids = [r["scene_id"] for r in raw_results if r.get("scene_id")]
            file_ids_set = list({r["file_id"] for r in raw_results if r.get("file_id")})
            scene_metadata_map: dict = {}
            file_metadata_map: dict = {}

            if upload_manager_service:
                try:
                    if scene_ids:
                        scene_meta = await upload_manager_service.get_metadata_batch_by_scenes(scene_ids)
                        if scene_meta:
                            for m in scene_meta:
                                if m.get("sceneId"):
                                    scene_metadata_map[m["sceneId"]] = m
                    if file_ids_set:
                        file_meta = await upload_manager_service.get_metadata_batch_by_files(file_ids_set)
                        if file_meta:
                            for m in file_meta:
                                fid = m.get("fileId")
                                if fid and not m.get("sceneId"):
                                    file_metadata_map[fid] = m
                except Exception as e:
                    logger.warning(f"[{correlation_id}] video_content_node: metadata fetch failed: {e}")

            for r in raw_results:
                file_details = r.get("file_details") or {}
                scene_details = r.get("scene_details") or {}
                file_id = r.get("file_id", "")
                scene_id = r.get("scene_id")

                metadata = None
                if scene_id and scene_id in scene_metadata_map:
                    metadata = scene_metadata_map[scene_id]
                elif file_id and file_id in file_metadata_map:
                    metadata = file_metadata_map[file_id]

                thumbnail_s3_key = scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath")
                file_s3_key = file_details.get("s3Key")
                s3_bucket = file_details.get("s3Bucket")

                search_results.append({
                    "file_id": file_id,
                    "scene_id": scene_id,
                    "file_name": file_details.get("fileName") or r.get("file_name", "Unknown"),
                    "file_type": file_details.get("fileType"),
                    "score": r.get("score", 0.0),
                    "thumbnail_s3_key": thumbnail_s3_key,
                    "thumbnail_s3_bucket": s3_bucket,
                    "file_s3_key": file_s3_key,
                    "file_s3_bucket": s3_bucket,
                    "thumbnail_url": scene_details.get("thumbnailUrl") or file_details.get("thumbnailUrl"),
                    "file_url": file_details.get("url"),
                    "youtube_url": file_details.get("youtubeUrl"),
                    "start_time": scene_details.get("startTime") or r.get("start_time"),
                    "end_time": scene_details.get("endTime") or r.get("end_time"),
                    "text_content": r.get("text", ""),
                    "description": metadata.get("summary") if metadata else None,
                })

            # Batch-sign all S3 URLs
            if s3_service and search_results:
                s3_items = []
                for r in search_results:
                    if r.get("thumbnail_s3_key"):
                        s3_items.append((r["thumbnail_s3_key"], r.get("thumbnail_s3_bucket")))
                    if r.get("file_s3_key"):
                        s3_items.append((r["file_s3_key"], r.get("file_s3_bucket")))
                if s3_items:
                    signed_map = await s3_service.get_signed_urls_batch(s3_items)
                    for r in search_results:
                        if r.get("thumbnail_s3_key") and r["thumbnail_s3_key"] in signed_map:
                            r["thumbnail_url"] = signed_map[r["thumbnail_s3_key"]]
                        if r.get("file_s3_key") and r["file_s3_key"] in signed_map:
                            r["file_url"] = signed_map[r["file_s3_key"]]

        except asyncio.TimeoutError:
            logger.error(f"[{correlation_id}] video_content_node: scene thumbnail search timed out")
        except Exception as e:
            logger.error(f"[{correlation_id}] video_content_node: scene thumbnail search failed: {e}", exc_info=True)

        sse_events.append({
            "type": "tool_result",
            "tool": "search_files",
            "results": search_results,
            "result_count": len(search_results),
        })
        sse_events.append({
            "type": "step_done",
            "step": "scene_thumbnails",
            "label": f"Loaded {len(search_results)} scene thumbnails",
        })

    logger.info(f"[{correlation_id}] video_content_node: done, context={len(combined_context)} chars, scenes={len(search_results)}")

    return {
        "retrieved_context": combined_context,
        "search_results": search_results or None,
        "tools_used": state.get("tools_used", []) + ["get_video_content"],
        "sse_events": sse_events,
    }

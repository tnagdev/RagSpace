import asyncio
import json
import logging
from langchain_core.runnables import RunnableConfig

from src.graph.state import AgentState
from src.graph.formatters import format_search_results_for_llm

logger = logging.getLogger(__name__)


async def video_search_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    file_embedder_service = config["configurable"]["file_embedder_service"]
    upload_manager_service = config["configurable"].get("upload_manager_service")
    s3_service = config["configurable"].get("s3_service")

    user_message = state["user_message"]
    user_id = state["user_id"]
    file_ids = state.get("file_ids") or None
    query_modality = state.get("query_modality") or "both"

    # Adjust text/image retrieval weights based on query type so visual queries
    # prioritise CLIP results while thematic/character queries lean on transcripts.
    _modality_weights = {
        "visual":    {"text_weight": 0.25, "image_weight": 0.75},
        "thematic":  {"text_weight": 0.80, "image_weight": 0.20},
        "character": {"text_weight": 0.75, "image_weight": 0.25},
        "both":      {"text_weight": 0.50, "image_weight": 0.50},
    }
    weights = _modality_weights.get(query_modality, _modality_weights["both"])

    logger.info(
        f"[{correlation_id}] video_search_node: searching for '{user_message[:80]}' "
        f"(modality={query_modality}, weights={weights})"
    )

    sse_events = [
        {"type": "step_start", "step": "video_search", "label": "Searching your videos..."},
        {"type": "tool_start", "tool": "search_files", "arguments": {"query": user_message}},
    ]

    raw_results = []
    try:
        search_response = await asyncio.wait_for(
            file_embedder_service.search(
                query=user_message,
                user_id=user_id,
                file_ids=file_ids,
                max_results=10,
                use_dynamic_retrieval=True,
                adaptive_scoring=True,
                enable_query_expansion=True,
                use_enhanced=True,
                **weights,
            ),
            timeout=30.0
        )
        if search_response and "results" in search_response:
            raw_results = search_response["results"]
    except asyncio.TimeoutError:
        logger.error(f"[{correlation_id}] video_search_node: search timed out")
        sse_events += [
            {"type": "tool_result", "tool": "search_files", "results": [], "result_count": 0},
            {"type": "step_done", "step": "video_search", "label": "Search timed out"},
        ]
        return {
            "search_results": [],
            "retrieved_context": "",
            "tools_used": state.get("tools_used", []) + ["search_files"],
            "sse_events": sse_events,
        }

    # Bulk-fetch metadata from upload-manager
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
            logger.warning(f"[{correlation_id}] video_search_node: metadata fetch failed: {e}")

    results = []
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

        if not thumbnail_s3_key:
            logger.warning(
                f"[{correlation_id}] video_search_node: no thumbnail S3 key for "
                f"file_id={file_id} scene_id={scene_id} "
                f"thumbnailS3Key={scene_details.get('thumbnailS3Key')!r} "
                f"thumbnailPath={file_details.get('thumbnailPath')!r}"
            )
        if not file_s3_key and not file_details.get("youtubeUrl"):
            logger.warning(
                f"[{correlation_id}] video_search_node: no file S3 key for "
                f"file_id={file_id} s3Key={file_details.get('s3Key')!r}"
            )

        result_data: dict = {
            "file_id": file_id,
            "scene_id": scene_id,
            "file_name": file_details.get("fileName") or r.get("file_name", "Unknown"),
            "file_type": file_details.get("fileType"),
            "score": r.get("score", 0.0),
            "timestamp": r.get("start_time") or r.get("timestamp"),
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
            "objects": metadata.get("objects") if metadata else None,
            "setting": metadata.get("setting") if metadata else None,
            "style": metadata.get("style") if metadata else None,
            "colors": metadata.get("colors") if metadata else None,
        }

        results.append(result_data)

    # Batch-generate fresh signed URLs for all results in one S3 client session
    if s3_service:
        try:
            s3_items = []
            for r in results:
                if r.get("thumbnail_s3_key"):
                    s3_items.append((r["thumbnail_s3_key"], r.get("thumbnail_s3_bucket")))
                if r.get("file_s3_key"):
                    s3_items.append((r["file_s3_key"], r.get("file_s3_bucket")))

            logger.info(f"[{correlation_id}] video_search_node: signing {len(s3_items)} S3 items")
            if s3_items:
                signed_map = await s3_service.get_signed_urls_batch(s3_items)
                logger.info(f"[{correlation_id}] video_search_node: got {len(signed_map)}/{len(s3_items)} signed URLs")
                for r in results:
                    if r.get("thumbnail_s3_key") and r["thumbnail_s3_key"] in signed_map:
                        r["thumbnail_url"] = signed_map[r["thumbnail_s3_key"]]
                    if r.get("file_s3_key") and r["file_s3_key"] in signed_map:
                        r["file_url"] = signed_map[r["file_s3_key"]]
        except Exception as e:
            logger.error(f"[{correlation_id}] video_search_node: batch S3 URL generation failed: {e}", exc_info=True)
    else:
        logger.warning(f"[{correlation_id}] video_search_node: s3_service is None, skipping URL signing")

    formatted = format_search_results_for_llm(results)
    retrieved_context = json.dumps(formatted, indent=2)

    sse_events += [
        {"type": "tool_result", "tool": "search_files", "results": results, "result_count": len(results)},
        {"type": "step_done", "step": "video_search", "label": f"Found {len(results)} results"},
    ]

    logger.info(f"[{correlation_id}] video_search_node: done, {len(results)} results")

    return {
        "search_results": results,
        "retrieved_context": retrieved_context,
        "tools_used": state.get("tools_used", []) + ["search_files"],
        "sse_events": sse_events,
    }

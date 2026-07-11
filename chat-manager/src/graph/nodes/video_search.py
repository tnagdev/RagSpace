import asyncio
import json
import logging
from langchain_core.runnables import RunnableConfig

from src.config import settings
from src.graph.state import AgentState
from src.graph.formatters import format_search_results_for_llm
from src.graph.utilities.metadata_service import fetch_metadata_maps, sign_s3_urls_inplace
from src.logging.node_logger import NodeLogger

logger = logging.getLogger(__name__)

# Text/image retrieval weights keyed by query modality.
# Visual queries prioritise CLIP embeddings; audio/thematic lean on text embeddings.
_MODALITY_WEIGHTS: dict[str, dict[str, float]] = {
    "visual":    {"text_weight": 0.25, "image_weight": 0.75},
    "audio":     {"text_weight": 0.95, "image_weight": 0.05},
    "thematic":  {"text_weight": 0.80, "image_weight": 0.20},
    "character": {"text_weight": 0.75, "image_weight": 0.25},
    "both":      {"text_weight": 0.50, "image_weight": 0.50},
}


async def video_search_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    file_embedder_service = config["configurable"]["file_embedder_service"]
    upload_manager_service = config["configurable"].get("upload_manager_service")
    s3_service = config["configurable"].get("s3_service")

    user_message = state["user_message"]
    user_id = state["user_id"]
    file_ids = state.get("file_ids") or None
    query_modality = state.get("query_modality") or "both"
    weights = _MODALITY_WEIGHTS.get(query_modality, _MODALITY_WEIGHTS["both"])

    # Broader queries need more results to cover the full video timeline.
    max_results = 25 if query_modality in ("thematic", "both", "audio") else 15

    log = NodeLogger(logger, correlation_id, "video_search")
    log.info(
        "start",
        query=user_message[:80],
        modality=query_modality,
        max_results=max_results,
        weights=weights,
    )

    sse_events = [
        {"type": "step_start", "step": "video_search", "label": "Searching your videos..."},
        {"type": "tool_start", "tool": "search_files", "arguments": {"query": user_message}},
    ]

    raw_results: list[dict] = []
    try:
        search_response = await asyncio.wait_for(
            file_embedder_service.search(
                query=user_message,
                user_id=user_id,
                file_ids=file_ids,
                max_results=max_results,
                use_dynamic_retrieval=True,
                adaptive_scoring=True,
                enable_query_expansion=True,
                use_enhanced=True,
                **weights,
            ),
            timeout=settings.video_search_timeout,
        )
        if search_response and "results" in search_response:
            raw_results = search_response["results"]
            _audio = sum(1 for r in raw_results if r.get("segment_index") is not None)
            _scene = len(raw_results) - _audio
            log.info("raw_results", total=len(raw_results), scene=_scene, audio=_audio)
            for i, r in enumerate(raw_results):
                logger.info(
                    "[%s] RAW_RESULT[%d] file_id=%s scene_idx=%s seg_idx=%s "
                    "score=%.4f text_score=%.4f image_score=%.4f "
                    "start=%s end=%s text_len=%d text=%r",
                    correlation_id, i,
                    r.get("file_id"), r.get("scene_index"), r.get("segment_index"),
                    r.get("score", 0), r.get("text_score", 0), r.get("image_score", 0),
                    r.get("start_time"), r.get("end_time"),
                    len(r.get("text") or ""), (r.get("text") or "")[:200],
                )
    except asyncio.TimeoutError:
        log.error("timeout", timeout_s=settings.video_search_timeout)
        sse_events += [
            {"type": "step_error", "step": "video_search", "error": "Search timed out", "error_code": "TIMEOUT"},
            {"type": "tool_result", "tool": "search_files", "results": [], "result_count": 0},
            {"type": "step_done", "step": "video_search", "label": "Search timed out"},
        ]
        return {
            "search_results": [],
            "retrieved_context": "",
            "tools_used": state.get("tools_used", []) + ["search_files"],
            "sse_events": sse_events,
        }

    scene_metadata_map, file_metadata_map = await fetch_metadata_maps(
        upload_manager_service, raw_results, correlation_id
    )

    results: list[dict] = []
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

        thumbnail_s3_key = scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath")
        file_s3_key = file_details.get("s3Key")
        s3_bucket = file_details.get("s3Bucket")

        if not thumbnail_s3_key:
            log.warning(
                "no_thumbnail_key",
                file_id=file_id,
                scene_id=scene_id,
                thumbnailS3Key=scene_details.get("thumbnailS3Key"),
                thumbnailPath=file_details.get("thumbnailPath"),
            )
        if not file_s3_key and not file_details.get("youtubeUrl"):
            log.warning("no_file_key", file_id=file_id, s3Key=file_details.get("s3Key"))

        is_audio_segment = r.get("segment_index") is not None
        results.append({
            "file_id": file_id,
            "scene_id": scene_id,
            "file_name": file_details.get("fileName") or r.get("file_name", "Unknown"),
            "file_type": file_details.get("fileType"),
            "result_type": "audio_segment" if is_audio_segment else "scene",
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
        })

    await sign_s3_urls_inplace(s3_service, results, correlation_id)

    # Sort by file then timestamp so the LLM reads events in chronological order.
    results.sort(key=lambda r: (r.get("file_id") or "", r.get("start_time") or 0.0))

    formatted = format_search_results_for_llm(results)
    retrieved_context = json.dumps(formatted, indent=2)

    logger.info(
        "[%s] RETRIEVED_CONTEXT_FOR_LLM (%d chars):\n%s",
        correlation_id, len(retrieved_context), retrieved_context,
    )

    sse_events += [
        {"type": "tool_result", "tool": "search_files", "results": results, "result_count": len(results)},
        {"type": "step_done", "step": "video_search", "label": f"Found {len(results)} results"},
    ]

    _audio_final = sum(1 for r in results if r.get("result_type") == "audio_segment")
    log.done(results=len(results), scene=len(results) - _audio_final, audio=_audio_final)

    return {
        "search_results": results,
        "retrieved_context": retrieved_context,
        "tools_used": state.get("tools_used", []) + ["search_files"],
        "sse_events": sse_events,
    }

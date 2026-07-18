"""Shared utilities for bulk metadata fetch and S3 URL signing.

Both video_search_node and video_content_node perform the same sequence:
  1. collect scene_ids and file_ids from raw search results
  2. batch-fetch metadata from upload-manager
  3. after building results, batch-sign S3 URLs

Extracting here avoids ~65 lines of duplication between the two nodes.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def fetch_metadata_maps(
    upload_manager_service: Any,
    raw_results: list[dict],
    correlation_id: str,
) -> tuple[dict, dict]:
    """Bulk-fetch scene and file metadata from upload-manager.

    Returns:
        (scene_metadata_map, file_metadata_map) — both keyed by their respective IDs.
        Returns empty dicts if upload_manager_service is None or the call fails.
    """
    scene_metadata_map: dict = {}
    file_metadata_map: dict = {}

    if not upload_manager_service:
        return scene_metadata_map, file_metadata_map

    scene_ids = [r["scene_id"] for r in raw_results if r.get("scene_id")]
    file_ids_set = list({r["file_id"] for r in raw_results if r.get("file_id")})

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
        logger.warning(f"[{correlation_id}] metadata fetch failed: {e}")

    return scene_metadata_map, file_metadata_map


async def sign_s3_urls_inplace(
    s3_service: Any,
    results: list[dict],
    correlation_id: str,
) -> None:
    """Batch-generate signed S3 URLs and update thumbnail_url / file_url in-place.

    Mutates each result dict directly. Logs a warning and returns without raising
    on failure so a signing error never aborts the full response.
    """
    if not s3_service or not results:
        return

    s3_items: list[tuple[str, str | None]] = []
    for r in results:
        if r.get("thumbnail_s3_key"):
            s3_items.append((r["thumbnail_s3_key"], r.get("thumbnail_s3_bucket")))
        if r.get("file_s3_key"):
            s3_items.append((r["file_s3_key"], r.get("file_s3_bucket")))

    if not s3_items:
        return

    try:
        logger.info(f"[{correlation_id}] signing {len(s3_items)} S3 items")
        signed_map = await s3_service.get_signed_urls_batch(s3_items)
        logger.info(f"[{correlation_id}] signed {len(signed_map)}/{len(s3_items)} URLs")
        for r in results:
            if r.get("thumbnail_s3_key") and r["thumbnail_s3_key"] in signed_map:
                r["thumbnail_url"] = signed_map[r["thumbnail_s3_key"]]
            if r.get("file_s3_key") and r["file_s3_key"] in signed_map:
                r["file_url"] = signed_map[r["file_s3_key"]]
    except Exception as e:
        logger.error(f"[{correlation_id}] S3 batch signing failed: {e}", exc_info=True)

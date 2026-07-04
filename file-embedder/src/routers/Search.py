import logging
import json
from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from src.models.query import (
    QueryRequest, QueryResponse, QueryResult, FileDetails, SceneDetails,
    VideoContentRequest, VideoContentSegment, VideoContentResponse,
    RouterFileContentRequest, RouterFileContentResponse,
)
from src.db.chroma_db import ChromaDatabaseManager
from src.services.UploadManagerService import UploadManagerService
from src.services.SceneDetectionService import SceneDetectionService
# Enhanced retrieval services from Video-RAG integration
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.services.TextEmbedderService import TextEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.utils.query_utils import expand_query



router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/search/advanced", response_model=QueryResponse)
async def advanced_search(
    body: QueryRequest,
    request: Request,
):
    """
    Advanced search endpoint using AdvancedRetrieverService with full Video-RAG capabilities.
    
    This endpoint provides:
    - Automatic query expansion and filtering
    - Multi-query averaging
    - Context expansion
    - Adaptive scoring
    - Enhanced confidence calculation
    
    Best for:
    - Complex semantic queries
    - When precision matters more than speed
    - Research and analytics use cases
    
    Args:
        body: Enhanced query request with Video-RAG parameters
        request: FastAPI request object
    
    Returns:
        Query response with enhanced statistics and metadata
    """
    try:
        retriever = AdvancedRetrieverService()
        
        user_id = body.user_id
        if not user_id and hasattr(request.state, 'user'):
            user_id = request.state.user.get("id") if request.state.user else None
        
        # Build filters - ChromaDB requires $and for multiple conditions
        filter_conditions = []
        
        if body.file_ids:
            if len(body.file_ids) == 1:
                filter_conditions.append({"file_id": body.file_ids[0]})
            else:
                # ChromaDB supports $or for multiple file IDs
                filter_conditions.append({"$or": [{"file_id": fid} for fid in body.file_ids]})
        
        if body.file_type:
            filter_conditions.append({"file_type": body.file_type})
        
        if user_id:
            filter_conditions.append({"user_id": user_id})
        
        # Combine conditions with $and if multiple
        if len(filter_conditions) == 0:
            filters = None
        elif len(filter_conditions) == 1:
            filters = filter_conditions[0]
        else:
            filters = {"$and": filter_conditions}
        
        logger.info(f"Advanced search filters: {filters}")
        
        # Query enhancement: expand into related queries
        queries = [body.query]
        if body.enable_query_expansion:
            expanded = expand_query(body.query, max_keywords=5)
            queries = expanded if expanded and len(expanded) > 0 else [body.query]
            logger.info(f"Advanced search: expanded '{body.query}' to {len(queries)} queries: {queries}")
        
        # Use AdvancedRetrieverService for sophisticated retrieval
        # Pass the original query as image_query for visual search
        results = retriever.retrieve_with_multi_query(
            queries=queries,
            image_query=body.query,  # Use same query for image similarity
            filters=filters if filters else None,
            threshold=body.threshold,
            top_k=body.top_k,
            use_contriever=body.use_enhanced,
            text_weight=body.text_weight,
            image_weight=body.image_weight,
            adaptive_scoring=body.adaptive_scoring
        )
        
        # Get retrieval statistics
        retrieval_stats = retriever.get_retrieval_stats(results)
        logger.info(f"Advanced search stats: {retrieval_stats}")
        
        # Fetch file and scene details
        upload_manager = UploadManagerService(user=request.state.user, session=request.state.session)
        scene_detector = SceneDetectionService(user=request.state.user, session=request.state.session)
        
        file_ids = list(set(r.get("file_id") for r in results if r.get("file_id")))
        file_details_cache = await upload_manager.get_files_batch(file_ids)
        if file_details_cache is None:
            file_details_cache = {}
        else:
            logger.info(f"Loaded {len(file_details_cache)} files from upload-manager")
            for fid, details in file_details_cache.items():
                logger.info(f"File {fid}: fileType={details.get('fileType')}, youtubeUrl={details.get('youtubeUrl')}")
        
        # Group results for scene fetching
        video_file_ids = set()
        audio_results_by_file = {}
        for result in results:
            if result.get("file_type") == "VIDEO":
                video_file_ids.add(result.get("file_id"))
                # Group audio segment results for timestamp matching
                if result.get("segment_index") is not None:
                    fid = result.get("file_id")
                    if fid not in audio_results_by_file:
                        audio_results_by_file[fid] = []
                    audio_results_by_file[fid].append(result)
        
        scenes_cache = {}
        if video_file_ids:
            scenes_by_file = await scene_detector.get_scenes_batch(list(video_file_ids))
            if scenes_by_file:
                for fid, scenes in scenes_by_file.items():
                    scenes_cache[fid] = {s["sceneNumber"]: s for s in scenes}
                
                # Map audio segments to their corresponding visual scenes by timestamp
                for fid, file_results in audio_results_by_file.items():
                    if fid not in scenes_cache:
                        scenes_cache[fid] = {}
                    
                    if fid in scenes_by_file:
                        all_scenes = scenes_by_file[fid]
                        
                        for result in file_results:
                            start_time = result.get("start_time")
                            end_time = result.get("end_time")
                            segment_idx = result.get('segment_index')
                            
                            if start_time is not None and end_time is not None and all_scenes:
                                matching_scene = None
                                for scene in all_scenes:
                                    scene_start = scene.get("startTime", 0)
                                    scene_end = scene.get("endTime", 0)
                                    
                                    if scene_start <= end_time and scene_end >= start_time:
                                        matching_scene = scene
                                        break
                                
                                if matching_scene:
                                    cache_key = f"audio_{segment_idx}"
                                    scenes_cache[fid][cache_key] = matching_scene
        
        # Build response
        query_results = []
        for result in results:
            fid = result.get("file_id", "")
            ftype = result.get("file_type")
            scene_idx = result.get("scene_index")
            segment_idx = result.get("segment_index")
            
            # File details
            file_details = None
            if fid in file_details_cache:
                fd = file_details_cache[fid]
                file_details = FileDetails(
                    id=fd.get("id", fid),
                    fileName=fd.get("originalFilename", ""),
                    fileType=fd.get("fileType", ftype or ""),
                    fileSize=fd.get("fileSize"),
                    mimeType=fd.get("mimeType"),
                    url=fd.get("s3Url"),
                    userId=fd.get("userId"),
                    thumbnailUrl=fd.get("thumbnailUrl"),
                    thumbnailPath=fd.get("thumbnailPath"),
                    s3Key=fd.get("s3Key"),
                    s3Bucket=fd.get("s3Bucket"),
                    youtubeUrl=fd.get("youtubeUrl")
                )
            
            # Scene details
            scene_details = None
            scene_id = None
            if ftype == "VIDEO":
                if scene_idx is not None and fid in scenes_cache:
                    # scene_index in ChromaDB is 0-based; sceneNumber in Prisma is 1-based.
                    # Add 1 to convert before looking up in scenes_cache.
                    scene = scenes_cache[fid].get(scene_idx + 1)
                    if scene:
                        scene_id = scene.get("id")
                        scene_details = SceneDetails(
                            id=scene_id,
                            sceneNumber=scene.get("sceneNumber", scene_idx + 1),
                            startTime=scene.get("startTime", 0.0),
                            endTime=scene.get("endTime", 0.0),
                            startFrame=scene.get("startFrame", 0),
                            endFrame=scene.get("endFrame", 0),
                            keyframe=scene.get("keyframe", 0),
                            duration=scene.get("duration", 0.0),
                            thumbnailUrl=scene.get("thumbnailS3Url"),
                            thumbnailS3Key=scene.get("thumbnailS3Key")
                        )
                    else:
                        logger.debug(f"Scene {scene_idx} (sceneNumber={scene_idx + 1}) not found in cache for file {fid}. Creating fallback from metadata.")
                        # Create partial scene details from embedding metadata
                        if result.get("start_time") is not None:
                            scene_details = SceneDetails(
                                sceneNumber=scene_idx + 1,
                                startTime=result.get("start_time", 0.0),
                                endTime=result.get("end_time", 0.0),
                                startFrame=result.get("start_frame", 0),
                                endFrame=result.get("end_frame", 0),
                                keyframe=result.get("start_frame", 0),
                                duration=result.get("end_time", 0.0) - result.get("start_time", 0.0),
                                thumbnailUrl=None
                            )
                elif segment_idx is not None and fid in scenes_cache:
                    # For audio segments, look up the mapped visual scene
                    cache_key = f"audio_{segment_idx}"
                    scene = scenes_cache[fid].get(cache_key)
                    if scene:
                        scene_id = scene.get("id")
                        scene_details = SceneDetails(
                            id=scene_id,
                            sceneNumber=scene.get("sceneNumber", 0),
                            startTime=scene.get("startTime", 0.0),
                            endTime=scene.get("endTime", 0.0),
                            startFrame=scene.get("startFrame", 0),
                            endFrame=scene.get("endFrame", 0),
                            keyframe=scene.get("keyframe", 0),
                            duration=scene.get("duration", 0.0),
                            thumbnailUrl=scene.get("thumbnailS3Url"),
                            thumbnailS3Key=scene.get("thumbnailS3Key")
                        )
                    else:
                        logger.debug(f"Audio segment scene '{cache_key}' not found for file {fid}. Creating fallback from metadata.")
                        # Create partial scene details from embedding metadata
                        if result.get("start_time") is not None:
                            scene_details = SceneDetails(
                                sceneNumber=0,
                                startTime=result.get("start_time", 0.0),
                                endTime=result.get("end_time", 0.0),
                                startFrame=0,
                                endFrame=0,
                                keyframe=0,
                                duration=result.get("end_time", 0.0) - result.get("start_time", 0.0),
                                thumbnailUrl=None
                            )
            
            # Use actual file type from file details if available (e.g., YOUTUBE_VIDEO instead of generic VIDEO)
            actual_file_type = ftype
            if fid in file_details_cache:
                actual_file_type = file_details_cache[fid].get("fileType", ftype)
            
            # Skip results with missing file details
            if not file_details:
                logger.warning(f"File details not found for file {fid}, skipping result")
                continue
            
            query_results.append(QueryResult(
                file_id=fid,
                file_name=file_details.fileName,
                file_type=actual_file_type,
                scene_id=scene_id,
                scene_index=scene_idx,
                segment_index=segment_idx,
                start_time=result.get("start_time"),
                end_time=result.get("end_time"),
                start_frame=result.get("start_frame"),
                end_frame=result.get("end_frame"),
                text=result.get("text"),
                score=result.get("score", 0.0),
                confidence=result.get("confidence", 0.0),
                text_score=result.get("text_score", 0.0),
                image_score=result.get("image_score", 0.0),
                file_details=file_details,
                scene_details=scene_details
            ))
        
        # Enhanced statistics
        stats = {
            **retrieval_stats,
            'query_expansion_enabled': body.enable_query_expansion,
            'expanded_queries': queries if body.enable_query_expansion else None,
            'contriever_used': body.use_enhanced,
            'adaptive_scoring_enabled': body.adaptive_scoring,
            'dynamic_retrieval_enabled': body.use_dynamic_retrieval,
            'threshold': body.threshold
        }
        
        return QueryResponse(
            query=body.query,
            filters=filters if filters else {},
            options={
                "top_k": body.top_k,
                "text_weight": body.text_weight,
                "image_weight": body.image_weight,
                "threshold": body.threshold,
                "use_dynamic_retrieval": body.use_dynamic_retrieval,
                "adaptive_scoring": body.adaptive_scoring
            },
            results=query_results,
            total_results=len(query_results),
            stats=stats
        )
        
    except Exception as e:
        logger.error(f"Error in advanced search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/content/video")
async def get_video_content(
    body: VideoContentRequest,
    request: Request,
):
    """
    Get ALL content for a video file, ordered chronologically.
    
    This endpoint retrieves all scenes and audio segments for a video,
    combining visual and audio information. Designed for:
    - Video summarization
    - Full video narration
    - Story reconstruction
    - Content overview
    
    Args:
        body: Request with file_id
        request: FastAPI request object
    
    Returns:
        Complete video content with scenes, transcripts, and metadata
    """
    try:
        chroma_db = ChromaDatabaseManager()
        upload_manager = UploadManagerService(user=request.state.user, session=request.state.session)
        scene_detector = SceneDetectionService(user=request.state.user, session=request.state.session)
        
        # Get file details
        file_details = await upload_manager.get_file_details(body.file_id)
        if not file_details:
            raise HTTPException(status_code=404, detail=f"File not found: {body.file_id}")
        
        # Get all content from ChromaDB
        content_data = chroma_db.get_all_content_for_file(body.file_id)
        
        # Get scene details with thumbnails from scene-detector
        scenes_by_file = await scene_detector.get_scenes_batch([body.file_id])
        scenes_cache = {}
        if scenes_by_file and body.file_id in scenes_by_file:
            scenes_cache = {s["sceneNumber"]: s for s in scenes_by_file[body.file_id]}
        
        # Get metadata if requested - index by both scene_id and scene_number for flexible lookup
        metadata_by_scene_id = {}
        metadata_by_scene_number = {}
        if body.include_metadata:
            try:
                metadata_list = await upload_manager.get_metadata_by_file(body.file_id)
                logger.info(f"Fetched {len(metadata_list) if metadata_list else 0} metadata records for file {body.file_id}")
                if metadata_list:
                    for m in metadata_list:
                        scene_id = m.get("sceneId")
                        if scene_id:
                            metadata_by_scene_id[scene_id] = m
                            # Also try to find the scene number for this scene_id
                            for scene_num, scene_info in scenes_cache.items():
                                if scene_info.get("id") == scene_id:
                                    metadata_by_scene_number[scene_num] = m
                                    break
            except Exception as e:
                logger.warning(f"Failed to fetch metadata: {e}")
        
        # Combine visual scenes and audio segments chronologically
        all_content = []
        
        # Process visual scenes
        for scene in content_data.get("scenes", []):
            scene_idx = scene.get("scene_index")
            scene_info = scenes_cache.get(scene_idx, {})
            scene_id = scene_info.get("id")
            
            # Try to get metadata by scene_id first, then by scene_number
            metadata = metadata_by_scene_id.get(scene_id, {}) or metadata_by_scene_number.get(scene_idx, {})
            
            segment = VideoContentSegment(
                type="visual",
                scene_id=scene_id,
                scene_index=scene_idx,
                start_time=scene.get("start_time") or scene_info.get("startTime"),
                end_time=scene.get("end_time") or scene_info.get("endTime"),
                duration=scene_info.get("duration"),
                text=scene.get("text", ""),
                description=metadata.get("summary") or metadata.get("description"),
                objects=metadata.get("objects"),
                setting=metadata.get("setting"),
                style=metadata.get("style"),
                colors=metadata.get("colors"),
                thumbnail_url=scene_info.get("thumbnailS3Url")
            )
            all_content.append(segment)
        
        # Process audio segments
        for segment in content_data.get("segments", []):
            seg = VideoContentSegment(
                type="audio",
                segment_index=segment.get("segment_index"),
                start_time=segment.get("start_time"),
                end_time=segment.get("end_time"),
                duration=(segment.get("end_time") or 0) - (segment.get("start_time") or 0),
                text=segment.get("text", "")
            )
            all_content.append(seg)
        
        # Sort all content by start_time for chronological order
        all_content.sort(key=lambda x: x.start_time or 0)
        
        # Calculate total duration
        total_duration = None
        if all_content:
            max_end_time = max(
                (c.end_time for c in all_content if c.end_time),
                default=None
            )
            total_duration = max_end_time
        
        # Build summary context for LLM
        summary_parts = []
        summary_parts.append(f"Video: {file_details.get('filename', 'Unknown')}")
        if total_duration:
            summary_parts.append(f"Duration: {total_duration:.1f} seconds ({total_duration/60:.1f} minutes)")
        summary_parts.append(f"Scenes: {content_data.get('total_scenes', 0)}")
        summary_parts.append(f"Audio segments: {content_data.get('total_segments', 0)}")
        summary_parts.append("\n--- Content Timeline ---\n")
        
        for idx, content in enumerate(all_content, 1):
            time_str = f"[{content.start_time:.1f}s - {content.end_time:.1f}s]" if content.start_time and content.end_time else ""
            
            if content.type == "visual":
                visual_parts = []
                if content.description:
                    visual_parts.append(content.description)
                if content.objects:
                    visual_parts.append(f"Objects: {', '.join(content.objects)}")
                if content.setting:
                    visual_parts.append(f"Setting: {content.setting}")
                
                if visual_parts:
                    summary_parts.append(f"{idx}. {time_str} [Visual] {' | '.join(visual_parts)}")
                elif content.text:
                    summary_parts.append(f"{idx}. {time_str} [Visual] {content.text[:200]}")
                else:
                    summary_parts.append(f"{idx}. {time_str} [Visual] Scene {content.scene_index}")
            elif content.type == "audio" and content.text:
                text_preview = content.text[:300] + "..." if len(content.text) > 300 else content.text
                summary_parts.append(f"{idx}. {time_str} [Audio] \"{text_preview}\"")
            elif content.text:
                text_preview = content.text[:200] + "..." if len(content.text) > 200 else content.text
                summary_parts.append(f"{idx}. {time_str} [{content.type}] {text_preview}")
        
        summary_context = "\n".join(summary_parts)
        
        special_docs = chroma_db.get_special_docs_for_file(body.file_id)

        return VideoContentResponse(
            file_id=body.file_id,
            file_name=file_details.get("filename"),
            file_type=file_details.get("fileType"),
            total_duration=total_duration,
            total_scenes=content_data.get("total_scenes", 0),
            total_segments=content_data.get("total_segments", 0),
            content=all_content,
            summary_context=summary_context,
            character_registry=special_docs.get("character_registry"),
            narrative_summary=special_docs.get("narrative"),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/content/file")
async def get_file_content(
    body: RouterFileContentRequest,
    request: Request,
):
    """
    Get content and metadata for any file type (image, audio, or video).
    
    For images: Returns metadata (description, objects, setting, colors, style)
    For audio: Returns transcript and metadata
    For videos: Redirects to get_video_content for full scene-by-scene breakdown
    
    This endpoint is designed for:
    - Image description and analysis
    - Audio transcription retrieval
    - Quick file content overview
    
    Args:
        body: Request with file_id
        request: FastAPI request object
    
    Returns:
        File content with metadata and summary context
    """
    try:
        chroma_db = ChromaDatabaseManager()
        upload_manager = UploadManagerService(user=request.state.user, session=request.state.session)
        
        # Get file details
        file_details = await upload_manager.get_file_details(body.file_id)
        if not file_details:
            raise HTTPException(status_code=404, detail=f"File not found: {body.file_id}")
        
        file_type = file_details.get("fileType", "").upper()
        file_name = file_details.get("filename", "Unknown")
        
        # Get metadata
        metadata = {}
        if body.include_metadata:
            try:
                metadata_list = await upload_manager.get_metadata_by_file(body.file_id)
                if metadata_list and len(metadata_list) > 0:
                    # For non-video files, there's typically one metadata record
                    metadata = metadata_list[0] if isinstance(metadata_list, list) else metadata_list
                    logger.info(f"Fetched metadata for file {body.file_id}: {list(metadata.keys())}")
            except Exception as e:
                logger.warning(f"Failed to fetch metadata for file {body.file_id}: {e}")
        
        # Get embeddings data from ChromaDB
        content_data = chroma_db.get_all_content_for_file(body.file_id)
        
        # Extract transcript from audio segments
        transcript = None
        if content_data.get("segments"):
            transcript_parts = []
            for seg in sorted(content_data["segments"], key=lambda x: x.get("start_time", 0) or 0):
                if seg.get("text"):
                    transcript_parts.append(seg["text"])
            if transcript_parts:
                transcript = " ".join(transcript_parts)
        
        # Build summary context for LLM based on file type
        summary_parts = []
        summary_parts.append(f"File: {file_name}")
        summary_parts.append(f"Type: {file_type}")
        
        if metadata.get("summary") or metadata.get("description"):
            summary_parts.append(f"\nDescription: {metadata.get('summary') or metadata.get('description')}")
        
        if metadata.get("objects"):
            objects = metadata["objects"]
            if isinstance(objects, list):
                summary_parts.append(f"Objects detected: {', '.join(objects)}")
            else:
                summary_parts.append(f"Objects detected: {objects}")
        
        if metadata.get("setting"):
            summary_parts.append(f"Setting: {metadata['setting']}")
        
        if metadata.get("style"):
            summary_parts.append(f"Style: {metadata['style']}")
        
        if metadata.get("colors"):
            colors = metadata["colors"]
            if isinstance(colors, list):
                summary_parts.append(f"Colors: {', '.join(colors)}")
            else:
                summary_parts.append(f"Colors: {colors}")
        
        if transcript:
            summary_parts.append(f"\nTranscript:\n\"{transcript}\"")
        
        # If it's a video, suggest using get_video_content for more detail
        if file_type == "VIDEO":
            summary_parts.append("\n[Note: For scene-by-scene breakdown, use the get_video_content tool]")
        
        summary_context = "\n".join(summary_parts)
        
        return RouterFileContentResponse(
            file_id=body.file_id,
            file_name=file_name,
            file_type=file_type,
            mime_type=file_details.get("mimeType"),
            file_url=file_details.get("s3Url"),
            thumbnail_url=file_details.get("thumbnailUrl") or file_details.get("thumbnailS3Url"),
            description=metadata.get("summary") or metadata.get("description"),
            objects=metadata.get("objects") if isinstance(metadata.get("objects"), list) else None,
            setting=metadata.get("setting"),
            style=metadata.get("style"),
            colors=metadata.get("colors") if isinstance(metadata.get("colors"), list) else None,
            transcript=transcript,
            summary_context=summary_context
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting file content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
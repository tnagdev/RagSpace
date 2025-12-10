import logging
import json
import asyncio
from fastapi import APIRouter, HTTPException, Request
from src.models.query import QueryRequest, QueryResponse, QueryResult, FileDetails, SceneDetails
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.db.chroma_db import ChromaDatabaseManager
from src.services.UploadManagerService import UploadManagerService
from src.services.SceneDetectionService import SceneDetectionService, GetScenesParams



router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/search", response_model=QueryResponse)
async def query_embeddings(
    body: QueryRequest,
    request: Request,
):
    """
        Query embeddings across text and image collections.
        
        Converts the query string into both text and image embeddings,
        then searches across both collections with optional filters.
        
        If user is authenticated, automatically filters by user_id unless explicitly overridden.
        
        Args:
            body: Query request with search text, filters, and options
            request: FastAPI request object for accessing state
        
        Returns:
            Merged results from text and image collections with scores
    """
    try:
        audio_embedder = AudioEmbedderService()
        video_embedder = VideoEmbedderService()
        chroma_db = ChromaDatabaseManager()
        text_embedding = audio_embedder.embed_text(body.query)
        image_embedding = video_embedder.embed_text_with_clip(body.query)
        
        # Try to get user_id from request state, fall back to body
        user_id = body.user_id
        if not user_id and hasattr(request.state, 'user'):
            user_id = request.state.user.get("id") if request.state.user else None
        
        filters = {}
        filter_fields = ["file_id", "file_type"]
        for field in filter_fields:
            if getattr(body, field) is not None:
                filters[field] = getattr(body, field)

        if user_id:
            filters["user_id"] = user_id
        
        options = {
            "top_k": body.top_k,
            "text_weight": body.text_weight,
            "image_weight": body.image_weight
        }
        
        results = chroma_db.query_index(
            text_query_vec=text_embedding,
            image_query_vec=image_embedding,
            filters=filters if filters else None,
            options=options
        )
        
        upload_manager = UploadManagerService(user=request.state.user, session=request.state.session)
        
        file_ids = list(set(r.get("file_id") for r in results if r.get("file_id")))
        
        # Batch fetch file details - single API call instead of N calls
        file_details_cache = await upload_manager.get_files_batch(file_ids)
        if file_details_cache is None:
            file_details_cache = {}
            logger.warning("Failed to fetch file details in batch, cache will be empty")
        
        video_results_by_file = {}
        audio_results_by_file = {}
        for result in results:
            fid = result.get("file_id")
            ftype = result.get("file_type")
            if ftype == "VIDEO" and result.get("scene_index") is not None:
                if fid not in video_results_by_file:
                    video_results_by_file[fid] = []
                video_results_by_file[fid].append(result)
            elif ftype == "VIDEO" and result.get("segment_index") is not None:
                if fid not in audio_results_by_file:
                    audio_results_by_file[fid] = []
                audio_results_by_file[fid].append(result)
        
        scene_detector = SceneDetectionService(user=request.state.user, session=request.state.session)
        scenes_cache = {}
        
        # Collect all unique file IDs that need scene data
        all_file_ids_for_scenes = set(video_results_by_file.keys()) | set(audio_results_by_file.keys())
        
        # Batch fetch all scenes at once
        if all_file_ids_for_scenes:
            scenes_by_file = await scene_detector.get_scenes_batch(list(all_file_ids_for_scenes))
            
            if scenes_by_file:
                # Process video results - store all scenes indexed by scene number
                for fid in video_results_by_file.keys():
                    if fid in scenes_by_file:
                        scenes_cache[fid] = {s["sceneNumber"]: s for s in scenes_by_file[fid]}
                
                # Process audio results - filter scenes by timestamp and store them
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
                                # Find the scene that overlaps with this audio segment
                                matching_scene = None
                                for scene in all_scenes:
                                    scene_start = scene.get("startTime", 0)
                                    scene_end = scene.get("endTime", 0)
                                    
                                    # Check if there's any overlap between audio segment and scene
                                    if scene_start <= end_time and scene_end >= start_time:
                                        matching_scene = scene
                                        break
                                
                                if matching_scene:
                                    cache_key = f"audio_{segment_idx}"
                                    scenes_cache[fid][cache_key] = matching_scene
            else:
                logger.warning("Failed to fetch scenes in batch")
        
        # Convert results to response model
        query_results = []
        for result in results:
            fid = result.get("file_id", "")
            ftype = result.get("file_type")
            scene_idx = result.get("scene_index")
            segment_idx = result.get("segment_index")
            
            # Build file details
            file_details = None
            if fid in file_details_cache:
                fd = file_details_cache[fid]
                logger.debug(f"File details for {fid}: {json.dumps(fd)}")
                file_details = FileDetails(
                    id=fd.get("id", fid),
                    fileName=fd.get("filename", ""),
                    fileType=fd.get("fileType", ftype or ""),
                    fileSize=fd.get("fileSize"),
                    mimeType=fd.get("mimeType"),
                    url=fd.get("s3Url"),
                    userId=fd.get("userId")
                )
            
            
            scene_details = None
            if ftype == "VIDEO":
                if scene_idx is not None and fid in scenes_cache:
                    scene = scenes_cache[fid].get(scene_idx)
                    if scene:
                        scene_details = SceneDetails(
                            sceneNumber=scene.get("sceneNumber", scene_idx),
                            startTime=scene.get("startTime", 0.0),
                            endTime=scene.get("endTime", 0.0),
                            startFrame=scene.get("startFrame", 0),
                            endFrame=scene.get("endFrame", 0),
                            keyframe=scene.get("keyframe", 0),
                            duration=scene.get("duration", 0.0),
                            thumbnailUrl=scene.get("thumbnailS3Url")
                        )
                elif segment_idx is not None and fid in scenes_cache:
                    cache_key = f"audio_{segment_idx}"
                    scene = scenes_cache[fid].get(cache_key)
                    if scene:
                        scene_details = SceneDetails(
                            sceneNumber=scene.get("sceneNumber", 0),
                            startTime=scene.get("startTime", 0.0),
                            endTime=scene.get("endTime", 0.0),
                            startFrame=scene.get("startFrame", 0),
                            endFrame=scene.get("endFrame", 0),
                            keyframe=scene.get("keyframe", 0),
                            duration=scene.get("duration", 0.0),
                            thumbnailUrl=scene.get("thumbnailS3Url")
                        )
            
            query_results.append(QueryResult(
                file_id=fid,
                file_name=result.get("file_name"),
                file_type=ftype,
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
        
        return QueryResponse(
            query=body.query,
            filters=filters,
            options=options,
            results=query_results,
            total_results=len(query_results)
        )
        
    except Exception as e:
        logger.error(f"Error querying embeddings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
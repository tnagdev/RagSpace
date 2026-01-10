import logging
import json
from fastapi import APIRouter, HTTPException, Request
from src.models.query import QueryRequest, QueryResponse, QueryResult, FileDetails, SceneDetails
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


@router.get("/search/debug")
async def debug_search(request: Request):
    """Debug endpoint to check ChromaDB state and available data."""
    try:
        chroma_db = ChromaDatabaseManager()
        text_collection = chroma_db.get_text_collection()
        image_collection = chroma_db.get_image_collection()
        
        # Get collection counts
        text_count = text_collection.count()
        image_count = image_collection.count()
        
        # Get sample data
        text_sample = None
        image_sample = None
        
        if text_count > 0:
            text_sample = text_collection.peek(limit=3)
        
        if image_count > 0:
            image_sample = image_collection.peek(limit=3)
        
        return {
            "status": "ok",
            "collections": {
                "text": {
                    "count": text_count,
                    "sample_ids": text_sample["ids"] if text_sample else []
                },
                "image": {
                    "count": image_count,
                    "sample_ids": image_sample["ids"] if image_sample else []
                }
            },
            "message": f"Found {text_count} text embeddings and {image_count} image embeddings"
        }
    except Exception as e:
        logger.error(f"Debug endpoint error: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


@router.post("/search", response_model=QueryResponse)
async def query_embeddings(
    body: QueryRequest,
    request: Request,
):
    """
        Enhanced query with Video-RAG improvements:
        - Multi-query averaging for better semantic coverage
        - Dynamic threshold retrieval (not fixed top-k)
        - Query enhancement with NLP filtering
        - Adaptive scoring based on video characteristics
        - Better confidence calculation
        
        Converts the query string into both text and image embeddings,
        then searches across both collections with optional filters.
        
        If user is authenticated, automatically filters by user_id unless explicitly overridden.
        
        Args:
            body: Query request with search text, filters, and options
            request: FastAPI request object for accessing state
        
        Returns:
            Merged results from text and image collections with enhanced scores
    """
    try:
        # Initialize enhanced services
        text_embedder = TextEmbedderService()
        image_embedder = ImageEmbedderService()
        chroma_db = ChromaDatabaseManager()
        
        # Use Contriever for better retrieval (if use_enhanced flag is set)
        use_contriever = getattr(body, 'use_enhanced', False)
        if use_contriever:
            logger.warning("Using Contriever model - ensure stored embeddings were also created with Contriever!")
        
        # Query enhancement: expand and filter if enabled
        queries_to_search = [body.query]
        if getattr(body, 'enable_query_expansion', False):
            # Expand query into multiple variants
            expanded = expand_query(body.query, max_keywords=5)
            queries_to_search = expanded if expanded and len(expanded) > 0 else [body.query]
            logger.info(f"Expanded query '{body.query}' to {len(queries_to_search)} variants: {queries_to_search}")
        
        # Generate embeddings with optional multi-query averaging
        if len(queries_to_search) > 1:
            # Multi-query averaging for richer semantics
            text_embeddings = []
            for q in queries_to_search:
                emb = text_embedder.embed_text(q, use_contriever=use_contriever)
                if emb is not None:
                    text_embeddings.append(emb)
            
            if text_embeddings:
                import numpy as np
                # Average and normalize (Video-RAG approach)
                text_embedding = np.mean(text_embeddings, axis=0)
                text_embedding = text_embedding / np.linalg.norm(text_embedding)
                logger.info(f"Averaged {len(text_embeddings)} query embeddings")
            else:
                text_embedding = text_embedder.embed_text(body.query, use_contriever=use_contriever)
        else:
            # Single query embedding
            text_embedding = text_embedder.embed_text(body.query, use_contriever=use_contriever)
        
        logger.info(f"Text embedding shape: {text_embedding.shape if text_embedding is not None else None}")
        
        if text_embedding is None:
            logger.error("Failed to generate text embedding")
            raise HTTPException(status_code=500, detail="Failed to generate text embedding")
        
        # Image embedding for multimodal search
        image_embedding = image_embedder.embed_text_with_clip(body.query)
        logger.info(f"Image embedding shape: {image_embedding.shape if image_embedding is not None else None}")
        
        if image_embedding is None:
            logger.error("Failed to generate image embedding")
            raise HTTPException(status_code=500, detail="Failed to generate image embedding")
        
        user_id = body.user_id
        if not user_id and hasattr(request.state, 'user'):
            user_id = request.state.user.get("id") if request.state.user else None
        
        filters = None
        filter_conditions = []
        if body.file_ids and len(body.file_ids) > 0:
            if len(body.file_ids) == 1:
                filter_conditions.append({"file_id": body.file_ids[0]})
            else:
                filter_conditions.append({"$or": [{"file_id": fid} for fid in body.file_ids]})
        
        if body.file_type:
            filter_conditions.append({"file_type": body.file_type})
        
        if user_id:
            filter_conditions.append({"user_id": user_id})
        
        if len(filter_conditions) == 1:
            filters = filter_conditions[0]
        elif len(filter_conditions) > 1:
            filters = {"$and": filter_conditions}
        
        logger.info(f"Applied filters: {filters}")
        logger.info(f"User ID from body: {body.user_id}, User ID from state: {user_id}")
        
        # Enhanced options with Video-RAG parameters
        # Note: ChromaDB cosine distance: 0=identical, 2=opposite, score = 1-distance
        # So threshold 0.0 means accept all results (score >= 0), threshold 0.5 means distance <= 0.5
        options = {
            "top_k": body.top_k,
            "text_weight": body.text_weight,
            "image_weight": body.image_weight,
            "threshold": getattr(body, 'threshold', 0.0),  # Default: no threshold filtering (was 0.2)
            "use_dynamic_retrieval": getattr(body, 'use_dynamic_retrieval', False),  # Disabled by default
            "adaptive_scoring": getattr(body, 'adaptive_scoring', False)
        }
        
        logger.info(f"Query: '{body.query}', Expanded queries: {queries_to_search}, Options: {options}")
        
        # Check collection sizes
        text_count = chroma_db.get_text_collection().count()
        image_count = chroma_db.get_image_collection().count()
        logger.info(f"ChromaDB collections - Text: {text_count}, Image: {image_count}")
        
        if text_count == 0 and image_count == 0:
            logger.warning("No embeddings found in ChromaDB. Please process files first.")
            return QueryResponse(
                query=body.query,
                filters=filters,
                options=options,
                results=[],
                total_results=0,
                stats={
                    'total_results': 0,
                    'avg_score': 0,
                    'avg_confidence': 0,
                    'text_matches': 0,
                    'image_matches': 0,
                    'multimodal_matches': 0,
                    'query_expansion_enabled': getattr(body, 'enable_query_expansion', False),
                    'expanded_queries': queries_to_search if getattr(body, 'enable_query_expansion', False) else None,
                    'error': 'No embeddings in database'
                }
            )
        
        # First try WITHOUT filters to see if we get any results at all
        results_no_filter = chroma_db.query_index(
            text_query_vec=text_embedding,
            image_query_vec=image_embedding,
            filters=None,  # No filters
            options=options
        )
        logger.info(f"Query WITHOUT filters returned {len(results_no_filter)} results")
        
        # Now query with filters
        results = chroma_db.query_index(
            text_query_vec=text_embedding,
            image_query_vec=image_embedding,
            filters=filters if filters else None,
            options=options
        )
        
        logger.info(f"Query WITH filters returned {len(results)} results before processing")
        
        upload_manager = UploadManagerService(user=request.state.user, session=request.state.session)
        
        file_ids = list(set(r.get("file_id") for r in results if r.get("file_id")))
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
        
        all_file_ids_for_scenes = set(video_results_by_file.keys()) | set(audio_results_by_file.keys())
        if all_file_ids_for_scenes:
            scenes_by_file = await scene_detector.get_scenes_batch(list(all_file_ids_for_scenes))
            
            if scenes_by_file:
                for fid in video_results_by_file.keys():
                    if fid in scenes_by_file:
                        scenes_cache[fid] = {s["sceneNumber"]: s for s in scenes_by_file[fid]}
                        logger.info(f"Cached {len(scenes_cache[fid])} scenes for file {fid}. Scene numbers: {list(scenes_cache[fid].keys())[:10]}...")

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
                    s3Key=fd.get("s3Key"),
                    s3Bucket=fd.get("s3Bucket"),
                    userId=fd.get("userId"),
                    thumbnailUrl=fd.get("thumbnailUrl"),
                    thumbnailPath=fd.get("thumbnailPath")
                )
            
            
            scene_details = None
            scene_id = None
            if ftype == "VIDEO":
                if scene_idx is not None and fid in scenes_cache:
                    scene = scenes_cache[fid].get(scene_idx)
                    if scene:
                        scene_id = scene.get("id")
                        scene_details = SceneDetails(
                            id=scene_id,
                            sceneNumber=scene.get("sceneNumber", scene_idx),
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
                        available_scenes = list(scenes_cache[fid].keys()) if fid in scenes_cache else []
                        logger.warning(f"Scene {scene_idx} (type: {type(scene_idx)}) not found for file {fid}. Available: {available_scenes[:10]}... (showing first 10)")
                        # Create partial scene details from embedding metadata
                        if result.get("start_time") is not None:
                            scene_details = SceneDetails(
                                sceneNumber=scene_idx,
                                startTime=result.get("start_time", 0.0),
                                endTime=result.get("end_time", 0.0),
                                startFrame=result.get("start_frame", 0),
                                endFrame=result.get("end_frame", 0),
                                keyframe=result.get("start_frame", 0),
                                duration=result.get("end_time", 0.0) - result.get("start_time", 0.0),
                                thumbnailUrl=None
                            )
                elif segment_idx is not None and fid in scenes_cache:
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
                        available_keys = list(scenes_cache[fid].keys()) if fid in scenes_cache else []
                        logger.warning(f"Audio segment scene '{cache_key}' not found for file {fid}. Available: {available_keys[:10]}... (showing first 10)")
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
            
            query_results.append(QueryResult(
                file_id=fid,
                file_name=result.get("file_name"),
                file_type=ftype,
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
        
        # Calculate retrieval statistics
        query_expansion_enabled = getattr(body, 'enable_query_expansion', False)
        stats = {
            'total_results': len(query_results),
            'avg_score': sum(r.score for r in query_results) / len(query_results) if query_results else 0.0,
            'avg_confidence': sum(r.confidence for r in query_results) / len(query_results) if query_results else 0.0,
            'text_matches': sum(1 for r in query_results if r.text_score > 0),
            'image_matches': sum(1 for r in query_results if r.image_score > 0),
            'multimodal_matches': sum(1 for r in query_results if r.text_score > 0 and r.image_score > 0),
            'query_expansion_used': query_expansion_enabled and len(queries_to_search) > 1,
            'expanded_queries': queries_to_search if query_expansion_enabled else None
        }
        
        return QueryResponse(
            query=body.query,
            filters=filters,
            options=options,
            results=query_results,
            total_results=len(query_results),
            stats=stats
        )
        
    except Exception as e:
        logger.error(f"Error querying embeddings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
        # Initialize advanced retriever (uses all improvements)
        retriever = AdvancedRetrieverService()
        
        user_id = body.user_id
        if not user_id and hasattr(request.state, 'user'):
            user_id = request.state.user.get("id") if request.state.user else None
        
        # Build filters
        filters = {}
        if body.file_ids:
            if len(body.file_ids) == 1:
                filters['file_id'] = body.file_ids[0]
            else:
                # ChromaDB supports $or for multiple file IDs
                filters = {"$or": [{"file_id": fid} for fid in body.file_ids]}
        
        if body.file_type:
            if filters and "$or" in filters:
                # Need to combine with AND
                filters = {"$and": [filters, {"file_type": body.file_type}]}
            else:
                filters['file_type'] = body.file_type
        
        if user_id:
            if filters and ("$or" in filters or "$and" in filters):
                # Complex filter already exists
                if "$and" in filters:
                    filters["$and"].append({"user_id": user_id})
                else:
                    filters = {"$and": [filters, {"user_id": user_id}]}
            else:
                filters['user_id'] = user_id
        
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
                    fileName=fd.get("filename", ""),
                    fileType=fd.get("fileType", ftype or ""),
                    fileSize=fd.get("fileSize"),
                    mimeType=fd.get("mimeType"),
                    url=fd.get("s3Url"),
                    userId=fd.get("userId"),
                    thumbnailUrl=fd.get("thumbnailUrl"),
                    thumbnailPath=fd.get("thumbnailPath"),
                    s3Key=fd.get("s3Key"),
                    s3Bucket=fd.get("s3Bucket")
                )
            
            # Scene details
            scene_details = None
            scene_id = None
            if ftype == "VIDEO":
                if scene_idx is not None and fid in scenes_cache:
                    scene = scenes_cache[fid].get(scene_idx)
                    if scene:
                        scene_id = scene.get("id")
                        scene_details = SceneDetails(
                            id=scene_id,
                            sceneNumber=scene.get("sceneNumber", scene_idx),
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
                        logger.debug(f"Scene {scene_idx} not found in cache for file {fid}. Creating fallback from metadata.")
                        # Create partial scene details from embedding metadata
                        if result.get("start_time") is not None:
                            scene_details = SceneDetails(
                                sceneNumber=scene_idx,
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
            
            query_results.append(QueryResult(
                file_id=fid,
                file_name=result.get("file_name"),
                file_type=ftype,
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
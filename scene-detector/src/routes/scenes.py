"""Scene management routes."""
import asyncio
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from src.services.s3_service import S3Service
from src.services.prisma_service import PrismaService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scenes", tags=["scenes"])


class SceneResponse(BaseModel):
    """Scene response model."""
    id: str
    fileId: str
    userId: str
    sceneNumber: int
    startTime: float
    endTime: float
    startFrame: int
    endFrame: int
    keyframe: int
    duration: float
    thumbnailS3Key: str
    thumbnailS3Url: Optional[str] = None
    metadata: Optional[dict] = None
    createdAt: str
    updatedAt: str


class ScenesListResponse(BaseModel):
    """Response model for scenes list."""
    scenes: List[SceneResponse]
    total: int
    fileId: Optional[str] = None
    userId: Optional[str] = None



@router.get("", response_model=ScenesListResponse)
async def get_scenes(
    request: Request,
    file_id: Optional[str] = Query(None, description="Filter by file ID"),
    file_ids: Optional[str] = Query(None, description="Comma-separated file IDs"),
    scene_ids: Optional[str] = Query(None, description="Comma-separated scene IDs"),
    start_time_gte: Optional[float] = Query(None, description="Filter scenes where startTime >= value"),
    start_time_lte: Optional[float] = Query(None, description="Filter scenes where startTime <= value"),
    end_time_gte: Optional[float] = Query(None, description="Filter scenes where endTime >= value"),
    end_time_lte: Optional[float] = Query(None, description="Filter scenes where endTime <= value"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
):
    """
    Get scenes with optional filters.
    
    Supports filtering by:
    - file_id: Get all scenes for a specific file
    - scene_ids: Get specific scenes by ID (comma-separated)
    - start_time_gte/lte: Filter by start time range
    - end_time_gte/lte: Filter by end time range
    - user_id: Filter by user (auto-applied if authenticated)
    
    Examples:
    - Get all scenes for a file: ?file_id=abc123
    - Get scenes by IDs: ?scene_ids=id1,id2,id3
    - Get scenes overlapping time range: ?start_time_lte=10.5&end_time_gte=5.0
    - Get scenes for audio segment: ?file_id=abc&start_time_gte=5.0&start_time_lte=10.0
    """
    try:
        if hasattr(request.state, 'user'):
            user = request.state.user if request.state.user else None
        # Build filters
        where_conditions = {}
        
        # Auto-inject user_id if authenticated and not explicitly provided
        filter_user_id = user_id
        if user and user.get("id") and not user_id:
            filter_user_id = user["id"]
            logger.info(f"Auto-filtering scenes by authenticated user_id: {filter_user_id}")
        
        if filter_user_id:
            where_conditions["userId"] = filter_user_id
        
        if file_id:
            where_conditions["fileId"] = file_id

        if file_ids:
            id_list = [id.strip() for id in file_ids.split(",") if id.strip()]
            if id_list:
                where_conditions["fileId"] = {"in": id_list}
        
        # Handle scene IDs filter
        if scene_ids:
            id_list = [id.strip() for id in scene_ids.split(",") if id.strip()]
            if id_list:
                where_conditions["id"] = {"in": id_list}
        
        # Time range filters - support overlapping ranges
        time_filters = []
        if start_time_gte is not None:
            time_filters.append({"startTime": {"gte": start_time_gte}})
        if start_time_lte is not None:
            time_filters.append({"startTime": {"lte": start_time_lte}})
        if end_time_gte is not None:
            time_filters.append({"endTime": {"gte": end_time_gte}})
        if end_time_lte is not None:
            time_filters.append({"endTime": {"lte": end_time_lte}})
        
        if time_filters:
            if "AND" not in where_conditions:
                where_conditions["AND"] = []
            where_conditions["AND"].extend(time_filters)
        
        # Clean up empty AND
        if "AND" in where_conditions and not where_conditions["AND"]:
            del where_conditions["AND"]
        
        logger.info(f"Querying scenes with filters: {where_conditions}")
        
        # Query database
        prisma_service = PrismaService()
        scenes = await prisma_service.prisma.scene.find_many(
            where=where_conditions if where_conditions else None,
            order={"sceneNumber": "asc"},
            skip=offset,
            take=limit
        )
        
        # Get total count
        total = await prisma_service.prisma.scene.count(
            where=where_conditions if where_conditions else None
        )
        
        # Generate signed URLs for thumbnails
        s3_service = S3Service()
        for scene in scenes:
            scene.thumbnailS3Url = await s3_service.get_signed_url(scene.thumbnailS3Key)

        # Convert to response model
        scene_responses = [
            SceneResponse(
                id=scene.id,
                fileId=scene.fileId,
                userId=scene.userId,
                sceneNumber=scene.sceneNumber,
                startTime=scene.startTime,
                endTime=scene.endTime,
                startFrame=scene.startFrame,
                endFrame=scene.endFrame,
                keyframe=scene.keyframe,
                duration=scene.duration,
                thumbnailS3Key=scene.thumbnailS3Key,
                thumbnailS3Url=scene.thumbnailS3Url,
                metadata=scene.metadata,
                createdAt=scene.createdAt.isoformat(),
                updatedAt=scene.updatedAt.isoformat()
            )
            for scene in scenes
        ]
        
        logger.info(f"Found {len(scene_responses)} scenes (total: {total})")
        
        return ScenesListResponse(
            scenes=scene_responses,
            total=total,
            fileId=file_id,
            userId=filter_user_id
        )
        
    except Exception as e:
        logger.error(f"Error fetching scenes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{scene_id}", response_model=SceneResponse)
async def get_scene_by_id(
    request: Request,
    scene_id: str,
):
    """Get a specific scene by ID."""
    try:
        if hasattr(request.state, 'user'):
            user = request.state.user if request.state.user else None
        
        # Build filters
        prisma_service = PrismaService()
        scene = await prisma_service.prisma.scene.find_unique(
            where={"id": scene_id}
        )
        
        if not scene:
            raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")
        
        # Check user access if authenticated
        if user and user.get("id") and scene.userId != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        s3_service = S3Service()
        scene.thumbnailS3Url = await s3_service.get_signed_url(scene.thumbnailS3Key)
        
        return SceneResponse(
            id=scene.id,
            fileId=scene.fileId,
            userId=scene.userId,
            sceneNumber=scene.sceneNumber,
            startTime=scene.startTime,
            endTime=scene.endTime,
            startFrame=scene.startFrame,
            endFrame=scene.endFrame,
            keyframe=scene.keyframe,
            duration=scene.duration,
            thumbnailS3Key=scene.thumbnailS3Key,
            thumbnailS3Url=scene.thumbnailS3Url,
            metadata=scene.metadata,
            createdAt=scene.createdAt.isoformat(),
            updatedAt=scene.updatedAt.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scene: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional




class QueryRequest(BaseModel):
    """Request model for querying embeddings with Video-RAG enhancements."""
    query: str = Field(..., description="Search query text")
    file_ids: List[str] | None = Field(None, description="Filter by specific file IDs")
    file_type: str | None = Field(None, description="Filter by file type (IMAGE, VIDEO, AUDIO)")
    user_id: str | None = Field(None, description="Filter by user ID")
    top_k: int = Field(10, ge=1, le=100, description="Number of results to return")
    text_weight: float = Field(0.5, ge=0, le=1, description="Weight for text embeddings")
    image_weight: float = Field(0.5, ge=0, le=1, description="Weight for image embeddings")
    threshold: float = Field(0.2, ge=0, le=1, description="Minimum similarity threshold for dynamic retrieval")
    use_dynamic_retrieval: bool = Field(True, description="Use dynamic threshold-based retrieval instead of fixed top-k")
    adaptive_scoring: bool = Field(True, description="Apply video-length normalization to scores")
    enable_query_expansion: bool = Field(True, description="Automatically expand query with related keywords")
    use_enhanced: bool = Field(True, description="Use Contriever model for better text retrieval")



class FileDetails(BaseModel):
    """File details from upload-manager."""
    id: str
    fileName: str
    fileType: str
    fileSize: int | None = None
    mimeType: str | None = None
    url: str | None = None
    s3Key: str | None = None
    s3Bucket: str | None = None
    s3Url: str | None = None
    userId: str | None = None
    thumbnailUrl: str | None = None
    thumbnailPath: str | None = None
    youtubeUrl: str | None = None


class SceneDetails(BaseModel):
    """Scene details for video results."""
    id: str | None = None  # Scene UUID from database
    sceneNumber: int
    startTime: float
    endTime: float
    startFrame: int
    endFrame: int
    keyframe: int
    duration: float
    thumbnailUrl: str | None = None
    thumbnailS3Key: str | None = None


class QueryResult(BaseModel):
    """Individual query result."""
    file_id: str
    file_name: str | None = None
    file_type: str | None = None
    scene_id: str | None = None  # Scene UUID from database
    scene_index: int | None = None
    segment_index: int | None = None
    text: str | None = None
    score: float
    confidence: float
    text_score: float
    image_score: float
    start_time: float | None = None
    end_time: float | None = None
    start_frame: int | None = None
    end_frame: int | None = None
    # Enhanced fields
    file_details: FileDetails | None = None
    scene_details: SceneDetails | None = None


class QueryResponse(BaseModel):
    """Response model for query results with enhanced statistics."""
    query: str
    filters: Dict[str, Any]
    options: Dict[str, Any]
    results: List[QueryResult]
    total_results: int
    stats: Dict[str, Any] | None = Field(None, description="Retrieval statistics (avg scores, match counts, etc.)")


class VideoContentRequest(BaseModel):
    """Request model for getting full video content."""
    file_id: str
    include_metadata: bool = True


class VideoContentSegment(BaseModel):
    """A segment of video content (visual scene or audio segment)."""
    type: str  # "visual" or "audio"
    scene_id: Optional[str] = None
    scene_index: Optional[int] = None
    segment_index: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    duration: Optional[float] = None
    text: Optional[str] = None
    description: Optional[str] = None
    objects: Optional[List[str]] = None
    setting: Optional[str] = None
    style: Optional[str] = None
    colors: Optional[List[str]] = None
    thumbnail_url: Optional[str] = None


class VideoContentResponse(BaseModel):
    """Response model for full video content."""
    file_id: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    total_duration: Optional[float] = None
    total_scenes: int = 0
    total_segments: int = 0
    content: List[VideoContentSegment] = []
    summary_context: str = ""
    character_registry: Optional[Dict[str, Any]] = None
    narrative_summary: Optional[Dict[str, Any]] = None


class RouterFileContentRequest(BaseModel):
    """Request model for getting content of any file type (image, audio, or video)."""
    file_id: str
    include_metadata: bool = True


class RouterFileContentResponse(BaseModel):
    """Response model for file content (image, audio, or video)."""
    file_id: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    mime_type: Optional[str] = None
    file_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    objects: Optional[List[str]] = None
    setting: Optional[str] = None
    style: Optional[str] = None
    colors: Optional[List[str]] = None
    transcript: Optional[str] = None
    summary_context: str = ""
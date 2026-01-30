from pydantic import BaseModel, Field
from typing import List, Dict, Any




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


class FileContentRequest(BaseModel):
    """Request model for getting all content from a file."""
    file_id: str = Field(..., description="The file ID to get content for")
    user_id: str | None = Field(None, description="User ID for authorization")
    include_metadata: bool = Field(True, description="Include file and scene metadata")


class SceneContent(BaseModel):
    """Content from a single scene."""
    scene_number: int
    start_time: float
    end_time: float
    duration: float
    transcript: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None


class FileContentResponse(BaseModel):
    """Response model for all content from a file."""
    file_id: str
    file_name: str | None = None
    file_type: str | None = None
    duration: float | None = None
    # All transcripts combined
    full_transcript: str | None = None
    # Scene-by-scene content
    scenes: List[SceneContent] = []
    # File-level metadata
    summary: str | None = None
    description: str | None = None
    objects: List[str] | None = None
    setting: str | None = None
    style: str | None = None
    colors: List[str] | None = None
    # Stats
    total_scenes: int = 0
    total_segments: int = 0
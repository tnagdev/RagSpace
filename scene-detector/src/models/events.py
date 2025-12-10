from pydantic import BaseModel
from typing import Any, Dict, Optional, List
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List
from .enums import EventType, FileType


class SceneData(BaseModel):
    """Scene detection result"""
    scene_number: int
    start_time: float
    end_time: float
    start_frame: int
    end_frame: int
    duration: float


class FileEvent(BaseModel):
    """File event from RabbitMQ"""
    type: str
    fileId: str
    userId: str
    timestamp: str
    data: Optional[dict] = None


class SceneResponse(BaseModel):
    """Scene response model"""
    id: str
    fileId: str
    sceneNumber: int
    startTime: float
    endTime: float
    startFrame: int
    endFrame: int
    duration: float
    thumbnailS3Key: str
    thumbnailS3Url: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True


class ProcessingCompleteEvent(BaseModel):
    """Event published when processing is complete"""
    type: str = "file.processing.completed"
    fileId: str
    userId: str
    timestamp: str
    data: dict

class AuthUser(BaseModel):
    id: str
    email: str
    username: Optional[str] = None
    name: Optional[str] = None
    emailVerified: Optional[bool] = None
    image: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class UploadEventFileMetadata(BaseModel):
    s3Key: str
    s3Url: str
    fileType: FileType
    fileName: str = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None


class UploadCompletedEventModel(BaseModel):
    type: EventType = EventType.UPLOAD_COMPLETED
    fileId: str
    user: AuthUser
    timestamp: str
    data: UploadEventFileMetadata


class ProcessingEventFileMetadata(BaseModel):
    sceneNumber: int
    startTime: float
    endTime: float
    startFrame: int
    endFrame: int
    keyframe: int
    thumbnailUrl: str
    thumbnailS3Key: str


class ProcessingEventSceneMetadata(BaseModel):
    scenes: List[ProcessingEventFileMetadata]
    scenes_detected: int


class ProcessingCompletedEventModel(BaseModel):
    type: EventType = EventType.PROCESSING_COMPLETED
    fileId: str
    fileName: str = None
    fileType: FileType
    user: AuthUser
    timestamp: str
    data: ProcessingEventSceneMetadata


class FileDeletedEventData(BaseModel):
    fileType: FileType
    fileName: str


class FileDeletedEventModel(BaseModel):
    type: EventType = EventType.FILE_DELETED
    fileId: str
    user: AuthUser
    timestamp: str
    data: FileDeletedEventData



class UpdateFileStatusParams(BaseModel):
    processingStatus: Optional[str] = None
    processingStage: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    errorMessage: Optional[str] = None
    processingStartedAt: Optional[datetime] = None
    processingCompletedAt: Optional[datetime] = None

# Backward compatibility alias
EventFileMetadata = UploadEventFileMetadata

from pydantic import BaseModel
from typing import Optional, List
from .enums import EventType, FileType



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
    s3Url: Optional[str] = None
    fileType: FileType
    fileName: str = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    youtubeUrl: Optional[str] = None


class Session(BaseModel):
    id: str
    token: str
    expiresAt: Optional[str] = None


class UploadCompletedEventModel(BaseModel):
    type: EventType = EventType.UPLOAD_COMPLETED
    fileId: str
    user: AuthUser
    session: Optional[Session] = None
    timestamp: str
    data: UploadEventFileMetadata


class ProcessingEventFileMetadata(BaseModel):
    id: Optional[str] = None
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
    session: Optional[Session] = None
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


# Backward compatibility alias
EventFileMetadata = UploadEventFileMetadata

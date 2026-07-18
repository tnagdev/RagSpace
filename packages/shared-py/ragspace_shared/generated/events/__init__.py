# =============================================================
# DO NOT EDIT — generated from contracts/events/
# Run `python scripts/generate.py` in packages/shared-py to regenerate.
# =============================================================

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict
from ..auth_user import AuthUser
from ..auth_session import AuthSession
from ..enums import FileType, EventType


class UploadEventFileMetadata(BaseModel):
    s3Key: str
    s3Url: Optional[str] = None
    fileType: FileType
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    youtubeUrl: Optional[str] = None
    videoId: Optional[str] = None


class UploadCompletedEvent(BaseModel):
    type: EventType = EventType.UPLOAD_COMPLETED
    fileId: str
    user: AuthUser
    session: Optional[AuthSession] = None
    timestamp: str
    data: UploadEventFileMetadata


class ProcessingEventSceneItem(BaseModel):
    id: Optional[str] = None
    sceneNumber: int
    startTime: float
    endTime: float
    startFrame: int
    endFrame: int
    keyframe: int
    thumbnailUrl: str
    thumbnailS3Key: str


class ProcessingEventData(BaseModel):
    scenes: List[ProcessingEventSceneItem]
    scenes_detected: int


class ProcessingCompletedEvent(BaseModel):
    type: EventType = EventType.PROCESSING_COMPLETED
    fileId: str
    fileName: Optional[str] = None
    fileType: FileType
    user: AuthUser
    session: Optional[AuthSession] = None
    timestamp: str
    data: ProcessingEventData


class FileDeletedEventData(BaseModel):
    fileType: FileType
    fileName: str


class FileDeletedEvent(BaseModel):
    type: EventType = EventType.FILE_DELETED
    fileId: Optional[str] = None
    fileIds: Optional[List[str]] = None
    user: AuthUser
    timestamp: str
    data: FileDeletedEventData


class UpdateFileStatusParams(BaseModel):
    filename: Optional[str] = None
    originalFilename: Optional[str] = None
    fileSize: Optional[int] = None
    processingStatus: Optional[str] = None
    processingStage: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    errorMessage: Optional[str] = None
    processingRetryCount: Optional[int] = None
    processingStartedAt: Optional[Any] = None
    processingCompletedAt: Optional[Any] = None


# Backward-compat aliases so existing event handlers don't need changes
UploadCompletedEventModel = UploadCompletedEvent
ProcessingCompletedEventModel = ProcessingCompletedEvent
FileDeletedEventModel = FileDeletedEvent
EventFileMetadata = UploadEventFileMetadata
ProcessingEventFileMetadata = ProcessingEventSceneItem
ProcessingEventSceneMetadata = ProcessingEventData

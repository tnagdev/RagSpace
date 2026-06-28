"""
Re-exports shared event models from ragspace_shared, plus scene-detector-specific models.
Single source of truth for event shapes is contracts/events/.
"""
from pydantic import BaseModel, ConfigDict
from typing import Any, Dict, Optional

# Shared types — imported from generated package
from ragspace_shared.generated.auth_user import AuthUser
from ragspace_shared.generated.events import (
    UploadEventFileMetadata,
    UploadCompletedEvent,
    UploadCompletedEventModel,
    ProcessingEventSceneItem,
    ProcessingEventSceneMetadata,
    ProcessingEventData,
    ProcessingCompletedEvent,
    ProcessingCompletedEventModel,
    FileDeletedEventData,
    FileDeletedEvent,
    FileDeletedEventModel,
    UpdateFileStatusParams,
    EventFileMetadata,
)
from ragspace_shared.generated.enums import FileType, EventType

# Backward-compat alias
ProcessingEventFileMetadata = ProcessingEventSceneItem


# ── Scene-detector-specific models (not shared) ──────────────────────────────

class SceneData(BaseModel):
    """Scene detection result — local to scene-detector."""
    scene_number: int
    start_time: float
    end_time: float
    start_frame: int
    end_frame: int
    duration: float


class FileEvent(BaseModel):
    """Generic file event envelope — local to scene-detector."""
    type: str
    fileId: str
    userId: str
    timestamp: str
    data: Optional[dict] = None


class SceneResponse(BaseModel):
    """HTTP response model for a stored scene — local to scene-detector."""
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

    model_config = ConfigDict(from_attributes=True)


class ProcessingCompleteEvent(BaseModel):
    """Published by scene-detector when processing finishes — mirrors ProcessingCompletedEvent."""
    type: str = "file.processing.completed"
    fileId: str
    userId: str
    timestamp: str
    data: dict


__all__ = [
    # shared re-exports
    "AuthUser",
    "UploadEventFileMetadata", "UploadCompletedEvent", "UploadCompletedEventModel",
    "ProcessingEventSceneItem", "ProcessingEventFileMetadata",
    "ProcessingEventSceneMetadata", "ProcessingEventData",
    "ProcessingCompletedEvent", "ProcessingCompletedEventModel",
    "FileDeletedEventData", "FileDeletedEvent", "FileDeletedEventModel",
    "UpdateFileStatusParams", "EventFileMetadata",
    "FileType", "EventType",
    # local
    "SceneData", "FileEvent", "SceneResponse", "ProcessingCompleteEvent",
]

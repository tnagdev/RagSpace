"""
Re-exports shared event models from ragspace_shared.
Single source of truth for event shapes is contracts/events/.
"""
from ragspace_shared.generated.auth_user import AuthUser
from ragspace_shared.generated.auth_session import AuthSession
from ragspace_shared.generated.events import (
    UploadEventFileMetadata,
    UploadCompletedEvent,
    UploadCompletedEventModel,
    ProcessingEventSceneItem,
    ProcessingEventFileMetadata,
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

# Session is in shared too
Session = AuthSession

__all__ = [
    "AuthUser", "AuthSession", "Session",
    "UploadEventFileMetadata", "UploadCompletedEvent", "UploadCompletedEventModel",
    "ProcessingEventSceneItem", "ProcessingEventFileMetadata",
    "ProcessingEventSceneMetadata", "ProcessingEventData",
    "ProcessingCompletedEvent", "ProcessingCompletedEventModel",
    "FileDeletedEventData", "FileDeletedEvent", "FileDeletedEventModel",
    "UpdateFileStatusParams", "EventFileMetadata",
    "FileType", "EventType",
]

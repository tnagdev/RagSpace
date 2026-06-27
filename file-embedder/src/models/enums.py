"""Enums for the Scene Detector service."""
from enum import Enum


class FileType(str, Enum):
    """File type classification."""
    VIDEO = "VIDEO"
    IMAGE = "IMAGE"
    AUDIO = "AUDIO"
    DOCUMENT = "DOCUMENT"
    YOUTUBE_VIDEO = "YOUTUBE_VIDEO"
    OTHER = "OTHER"


class EventType(str, Enum):
    """RabbitMQ event types."""
    # Upload events
    UPLOAD_STARTED = "file.upload.started"
    UPLOAD_PROGRESS = "file.upload.progress"
    UPLOAD_COMPLETED = "file.upload.completed"
    UPLOAD_FAILED = "file.upload.failed"
    
    # Processing events
    PROCESSING_STARTED = "file.processing.started"
    PROCESSING_PROGRESS = "file.processing.progress"
    PROCESSING_COMPLETED = "file.processing.completed"
    PROCESSING_RETRYING = "file.processing.retrying"
    PROCESSING_FAILED = "file.processing.failed"
    
    # Scene detection events
    SCENE_DETECTION_STARTED = "file.scene.detection.started"
    SCENE_DETECTION_COMPLETED = "file.scene.detection.completed"
    SCENE_DETECTION_FAILED = "file.scene.detection.failed"
    
    # Indexing completion — distinct from PROCESSING_COMPLETED to avoid re-triggering embedder
    INDEXING_COMPLETED = "file.indexing.completed"

    # File management events
    FILE_DELETED = "file.deleted"


class ProcessingStatus(str, Enum):
    """Processing status for files."""
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ProcessingStage(str, Enum):
    """Processing stages."""
    UPLOAD = "UPLOAD"
    EMBEDDING = "EMBEDDING"
    SCENE_DETECTION = "SCENE_DETECTION"
    INDEXING = "INDEXING"
    COMPLETED = "COMPLETED"


class ServiceStatus(str, Enum):
    """Service operational status."""
    OPERATIONAL = "operational"
    DEGRADED = "degraded"
    DOWN = "down"
    ERROR = "error"

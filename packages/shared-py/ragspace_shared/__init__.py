"""
ragspace-shared — shared Pydantic models, HTTP client, middleware, and payment utilities
for all RagSpace Python microservices.

Quick start::

    from ragspace_shared.generated import AuthUser, FileType, EventType, UploadCompletedEvent
    from ragspace_shared.http import BaseHttpClient
    from ragspace_shared.middleware import InterServiceMiddleware
    from ragspace_shared.payment import check_quota, require_plan, UsageMetricType
"""

from .generated import (
    AuthUser, AuthSession, UploadedFile, Scene,
    UsageCheckResult, PlanValidationResult,
    FileType, EventType, ProcessingStatus, ProcessingStage,
    ServiceStatus, UsageMetricType,
    UploadEventFileMetadata, UploadCompletedEvent, UploadCompletedEventModel,
    ProcessingEventSceneItem, ProcessingEventData,
    ProcessingCompletedEvent, ProcessingCompletedEventModel,
    FileDeletedEventData, FileDeletedEvent, FileDeletedEventModel,
    UpdateFileStatusParams, EventFileMetadata,
)
from .http import BaseHttpClient
from .middleware import InterServiceMiddleware
from .payment import PaymentClient, init_payment_client, get_payment_client, check_quota, require_plan

__all__ = [
    # models
    "AuthUser", "AuthSession", "UploadedFile", "Scene",
    "UsageCheckResult", "PlanValidationResult",
    # enums
    "FileType", "EventType", "ProcessingStatus", "ProcessingStage",
    "ServiceStatus", "UsageMetricType",
    # events
    "UploadEventFileMetadata", "UploadCompletedEvent", "UploadCompletedEventModel",
    "ProcessingEventSceneItem", "ProcessingEventData",
    "ProcessingCompletedEvent", "ProcessingCompletedEventModel",
    "FileDeletedEventData", "FileDeletedEvent", "FileDeletedEventModel",
    "UpdateFileStatusParams", "EventFileMetadata",
    # infrastructure
    "BaseHttpClient", "InterServiceMiddleware",
    "PaymentClient", "init_payment_client", "get_payment_client",
    "check_quota", "require_plan",
]

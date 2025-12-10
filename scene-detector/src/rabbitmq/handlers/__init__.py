"""
Event handlers for RabbitMQ messages.
Import all handlers here to ensure they are registered with the consumer.
"""

from . import file_upload_completed_handler
from . import file_deleted_handler

__all__ = [
    "file_upload_completed_handler",
    "file_deleted_handler",
]

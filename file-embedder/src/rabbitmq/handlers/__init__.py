"""
RabbitMQ event handlers.

This module automatically imports all handler modules to register their decorators.
When this package is imported, all handlers decorated with @rabbitmq_consumer.register_handler
will be automatically registered.
"""

# Import all handler modules to trigger decorator registration
from . import file_upload_complete_handler
from . import file_processing_complete_handler
from . import file_deleted_handler

__all__ = [
    'file_upload_complete_handler',
    'file_processing_complete_handler',
    'file_deleted_handler',
]

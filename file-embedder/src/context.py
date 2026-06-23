"""Request-scoped context propagation via contextvars."""
import logging
import uuid
from contextvars import ContextVar

# Holds the correlation ID for the current request or message handler invocation.
# Set in InterServiceMiddleware (HTTP) and RabbitMQConsumer.process_message (events).
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    return correlation_id_var.get()


class CorrelationIdFilter(logging.Filter):
    """Logging filter that injects correlation_id into every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_var.get() or "-"
        return True

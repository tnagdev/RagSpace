import logging
import sys
import uuid
from contextvars import ContextVar

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="-")


def current_correlation_id() -> str:
    value = correlation_id_var.get()
    return value if value != "-" else str(uuid.uuid4())


class CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_var.get()
        return True


def configure_logging(service: str, level: int = logging.INFO) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(CorrelationIdFilter())
    handler.setFormatter(
        logging.Formatter(
            f"%(asctime)s %(levelname)-7s [{service}] [%(name)s] cid=%(correlation_id)s %(message)s"
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

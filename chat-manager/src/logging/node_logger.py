import logging
import time
from typing import Any


class NodeLogger:
    """Prefixes graph-node log lines with the node name and adds elapsed time to the completion line."""

    def __init__(self, logger: logging.Logger, node_name: str) -> None:
        self._log = logger
        self.node = node_name
        self._t0 = time.perf_counter()

    def _fmt(self, msg: str, kv: dict[str, Any]) -> str:
        fields = " ".join(f"{k}={v}" for k, v in kv.items())
        return f"{self.node}: {msg} {fields}".rstrip()

    def info(self, msg: str, **kv: Any) -> None:
        self._log.info(self._fmt(msg, kv))

    def warning(self, msg: str, **kv: Any) -> None:
        self._log.warning(self._fmt(msg, kv))

    def error(self, msg: str, exc_info: bool = False, **kv: Any) -> None:
        self._log.error(self._fmt(msg, kv), exc_info=exc_info)

    def done(self, **kv: Any) -> None:
        self.info("done", elapsed_ms=int((time.perf_counter() - self._t0) * 1000), **kv)

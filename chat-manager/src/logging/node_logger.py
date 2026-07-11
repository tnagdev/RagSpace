"""Structured per-node logger for the LangGraph pipeline.

Usage in a node:
    log = NodeLogger(logger, correlation_id, "intent_classifier")
    log.info("start", message_len=len(user_message))
    ...
    log.done(intent=intent, modality=modality)
"""
import logging
import time
from typing import Any


class NodeLogger:
    """Wraps a stdlib logger with correlation_id prefix, kv-style fields, and elapsed timing."""

    def __init__(self, logger: logging.Logger, correlation_id: str, node_name: str) -> None:
        self._log = logger
        self.cid = correlation_id
        self.node = node_name
        self._t0 = time.perf_counter()

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self._t0) * 1000)

    def _fmt(self, msg: str, kv: dict[str, Any]) -> str:
        kv_str = " ".join(f"{k}={v}" for k, v in kv.items())
        base = f"[{self.cid}] {self.node}: {msg}"
        return f"{base} {kv_str}".rstrip()

    def _fmt_repr(self, msg: str, kv: dict[str, Any]) -> str:
        kv_str = " ".join(f"{k}={v!r}" for k, v in kv.items())
        base = f"[{self.cid}] {self.node}: {msg}"
        return f"{base} {kv_str}".rstrip()

    def info(self, msg: str, **kv: Any) -> None:
        self._log.info(self._fmt(msg, kv))

    def debug(self, msg: str, **kv: Any) -> None:
        self._log.debug(self._fmt_repr(msg, kv))

    def warning(self, msg: str, **kv: Any) -> None:
        self._log.warning(self._fmt(msg, kv))

    def error(self, msg: str, exc_info: bool = False, **kv: Any) -> None:
        self._log.error(self._fmt(msg, kv), exc_info=exc_info)

    def done(self, **summary_kv: Any) -> None:
        """Log a completion line that always includes elapsed_ms."""
        self.info("done", elapsed_ms=self.elapsed_ms(), **summary_kv)

from typing import Any

from ragspace.common.v1 import common_pb2


def step_started(step: str, label: str) -> dict[str, Any]:
    return {"type": "step", "step": step, "label": label, "status": "started"}


def step_done(step: str, label: str) -> dict[str, Any]:
    return {"type": "step", "step": step, "label": label, "status": "done"}


def step_failed(step: str, error: str, error_code: str) -> dict[str, Any]:
    return {"type": "step", "step": step, "label": error, "status": "failed", "error": error, "error_code": error_code}


def tool_started(tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool", "tool": tool, "status": "started", "arguments": arguments}


def tool_done(tool: str, result_count: int) -> dict[str, Any]:
    return {"type": "tool", "tool": tool, "status": "done", "result_count": result_count}


def results(kind: str, hits: list[common_pb2.SearchHit]) -> dict[str, Any]:
    return {"type": "results", "kind": kind, "hits": hits}

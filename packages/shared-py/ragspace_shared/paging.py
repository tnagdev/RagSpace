import base64
import json
from typing import Any

from .rpc.errors import invalid_argument

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_BATCH_IDS = 100


def clamp_page_size(requested: int, fallback: int = DEFAULT_PAGE_SIZE, maximum: int = MAX_PAGE_SIZE) -> int:
    if requested < 1:
        return fallback
    return min(requested, maximum)


def encode_page_token(cursor: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(cursor).encode()).decode().rstrip("=")


def decode_page_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception as error:
        raise invalid_argument("Invalid page token") from error


def assert_batch_size(ids: list[str], field: str = "ids", maximum: int = MAX_BATCH_IDS) -> None:
    if len(ids) > maximum:
        raise invalid_argument(f"{field} accepts at most {maximum} values")

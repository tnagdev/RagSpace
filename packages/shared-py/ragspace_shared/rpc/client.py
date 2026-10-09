import json
from typing import Any, Generic, TypeVar

import grpc

from ..context import current_correlation_id

StubT = TypeVar("StubT")

_SERVICE_CONFIG = json.dumps(
    {
        "loadBalancingConfig": [{"round_robin": {}}],
        "methodConfig": [
            {
                "name": [{}],
                "retryPolicy": {
                    "maxAttempts": 3,
                    "initialBackoff": "0.1s",
                    "maxBackoff": "1s",
                    "backoffMultiplier": 2,
                    "retryableStatusCodes": ["UNAVAILABLE"],
                },
            }
        ],
    }
)


class RpcClient(Generic[StubT]):
    """Stub plus per-call defaults: `await client.stub.GetFile(req, **client.opts())`."""

    def __init__(self, target: str, stub_cls: type[StubT], caller: str, timeout_s: float) -> None:
        self.channel = grpc.aio.insecure_channel(
            target,
            options=[("grpc.service_config", _SERVICE_CONFIG), ("grpc.enable_retries", 1)],
        )
        self.stub: StubT = stub_cls(self.channel)
        self.caller = caller
        self.timeout_s = timeout_s

    def opts(self, timeout_s: float | None = None) -> dict[str, Any]:
        return {
            "timeout": timeout_s if timeout_s is not None else self.timeout_s,
            "metadata": (("x-correlation-id", current_correlation_id()), ("x-caller", self.caller)),
        }

    async def close(self) -> None:
        await self.channel.close()


def error_meta(error: grpc.aio.AioRpcError) -> dict[str, str]:
    return {key: str(value) for key, value in (error.trailing_metadata() or ()) if key.startswith("x-")}

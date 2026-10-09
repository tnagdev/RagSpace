import grpc

ERROR_CODE_KEY = "x-error-code"


class RpcError(Exception):
    def __init__(
        self,
        status: grpc.StatusCode,
        reason: str,
        message: str,
        meta: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.reason = reason
        self.message = message
        self.meta = meta or {}


def invalid_argument(message: str) -> RpcError:
    return RpcError(grpc.StatusCode.INVALID_ARGUMENT, "validation_failed", message)


def not_found(resource: str) -> RpcError:
    return RpcError(grpc.StatusCode.NOT_FOUND, "not_found", f"{resource} not found")


def failed_precondition(message: str) -> RpcError:
    return RpcError(grpc.StatusCode.FAILED_PRECONDITION, "conflict", message)


def permission_denied(message: str) -> RpcError:
    return RpcError(grpc.StatusCode.PERMISSION_DENIED, "forbidden", message)


def unavailable(message: str) -> RpcError:
    return RpcError(grpc.StatusCode.UNAVAILABLE, "upstream_unavailable", message)


def quota_exceeded(metric: str, used: int, limit: int, message: str) -> RpcError:
    return RpcError(
        grpc.StatusCode.RESOURCE_EXHAUSTED,
        "quota_exceeded",
        message,
        {"x-quota-metric": metric, "x-quota-used": str(used), "x-quota-limit": str(limit)},
    )

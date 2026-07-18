"""
File-embedder inter-service middleware.

Extends the shared InterServiceMiddleware to also handle correlation IDs,
which are used for distributed tracing across services.
"""
import uuid
from fastapi import Request
from starlette.types import ASGIApp

from ragspace_shared.middleware import InterServiceMiddleware as BaseInterServiceMiddleware
from src.context import correlation_id_var


class InterServiceMiddleware(BaseInterServiceMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # Parse x-user / x-session (from shared base)
        self.extract_context(request)

        # Add correlation ID tracking
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        token = correlation_id_var.set(correlation_id)
        try:
            response = await call_next(request)
        finally:
            correlation_id_var.reset(token)
        return response

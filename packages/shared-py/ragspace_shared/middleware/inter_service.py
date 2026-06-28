"""Middleware for extracting inter-service auth context from request headers."""
import json
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


class InterServiceMiddleware(BaseHTTPMiddleware):
    """
    Extracts ``x-user`` and ``x-session`` headers set by the API Gateway
    and makes them available on ``request.state.user`` / ``request.state.session``.

    Services that need additional context (e.g. correlation IDs) should
    subclass this middleware and override ``dispatch``, calling
    ``self.extract_context(request)`` to get the base header parsing.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    @staticmethod
    def extract_context(request: Request) -> None:
        """Parse x-user and x-session headers into request.state. Call this from subclass dispatch."""
        x_user = request.headers.get("x-user")
        x_session = request.headers.get("x-session")

        request.state.x_user = x_user
        request.state.x_session = x_session

        try:
            request.state.user = json.loads(x_user) if x_user else None
        except Exception:
            logger.warning("Failed to parse x-user header")
            request.state.user = None

        try:
            request.state.session = json.loads(x_session) if x_session else None
        except Exception:
            logger.warning("Failed to parse x-session header")
            request.state.session = None

    async def dispatch(self, request: Request, call_next):
        self.extract_context(request)
        return await call_next(request)

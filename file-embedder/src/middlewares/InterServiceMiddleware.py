"""Middleware for handling inter-service authentication and context propagation."""
import logging
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import json
from src.context import correlation_id_var

logger = logging.getLogger(__name__)


class InterServiceMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        x_user = request.headers.get("x-user")
        x_session = request.headers.get("x-session")
        request.state.x_user = x_user
        request.state.user = json.loads(x_user) if x_user else None
        request.state.x_session = x_session
        request.state.session = json.loads(x_session) if x_session else None

        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        token = correlation_id_var.set(correlation_id)
        try:
            response = await call_next(request)
        finally:
            correlation_id_var.reset(token)
        return response

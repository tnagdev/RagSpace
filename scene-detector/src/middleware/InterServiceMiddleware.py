"""Middleware for handling inter-service authentication and context propagation."""
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import json

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
        response = await call_next(request)
        return response
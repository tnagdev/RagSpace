"""Base HTTP client for inter-service communication in RagSpace Python services."""
import httpx
import logging
from json import dumps as json_dumps
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_shared_client: Optional[httpx.AsyncClient] = None


def _get_shared_client(timeout: httpx.Timeout) -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=timeout)
    return _shared_client


class BaseHttpClient:
    """
    Base class for inter-service HTTP clients.

    Subclasses set the ``service_name`` class attribute to identify the caller
    in the ``x-service`` header — no constructor change needed.

    Usage::

        class HttpClient(BaseHttpClient):
            service_name = "scene-detector"

            def __init__(self, user, session):
                super().__init__(user, session)
                self.upload_manager_url = settings.upload_manager_url
    """

    service_name: str = "unknown-service"

    def __init__(self, user: Any, session: Any) -> None:
        self.timeout = httpx.Timeout(30.0, connect=10.0)
        self.user = user
        self.session = session

    async def send_request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        """Send an HTTP request with inter-service auth headers injected automatically."""
        try:
            logger.info(f"Sending {method} request to: {url}")
            client = _get_shared_client(self.timeout)
            req_headers: Dict[str, str] = dict(headers or {})

            if self.user:
                user_data = self.user.model_dump() if hasattr(self.user, "model_dump") else self.user
                req_headers["x-user"] = json_dumps(user_data) if isinstance(user_data, dict) else str(user_data)

            if self.session:
                session_data = self.session.model_dump() if hasattr(self.session, "model_dump") else self.session
                req_headers["x-session"] = json_dumps(session_data) if isinstance(session_data, dict) else str(session_data)

            req_headers["x-service"] = self.service_name

            response = await client.request(method, url, headers=req_headers, params=params, json=json)
            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error during {method} {url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during {method} {url}: {e}")
            return None

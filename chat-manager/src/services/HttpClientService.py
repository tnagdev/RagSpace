"""HTTP client for chat-manager inter-service communication."""
from ragspace_shared.http import BaseHttpClient
from src.config import settings


class HttpClient(BaseHttpClient):
    """Chat-manager HTTP client — sets service identity and exposes service URLs."""

    service_name = "chat-manager"

    def __init__(self, user, session) -> None:
        super().__init__(user, session)
        self.file_embedder_url = settings.file_embedder_url
        self.upload_manager_url = settings.upload_manager_url
        self.scene_detector_url = settings.scene_detector_url

    async def send_request(self, method, url, headers=None, params=None, json_data=None, json=None):
        """Override to support the legacy ``json_data`` kwarg used by callers."""
        return await super().send_request(method, url, headers=headers, params=params, json=json_data or json)

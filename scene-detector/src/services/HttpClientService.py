"""HTTP client for scene-detector inter-service communication."""
from ragspace_shared.http import BaseHttpClient
from src.config.settings import settings


class HttpClient(BaseHttpClient):
    """Scene-detector HTTP client — sets service identity and exposes service URLs."""

    service_name = "scene-detector"

    def __init__(self, user, session) -> None:
        super().__init__(user, session)
        self.upload_manager_url = settings.upload_manager_url

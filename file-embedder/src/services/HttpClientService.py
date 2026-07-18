"""HTTP client for file-embedder inter-service communication."""
from ragspace_shared.http import BaseHttpClient
from src.config import settings


class HttpClient(BaseHttpClient):
    """File-embedder HTTP client — sets service identity and exposes service URLs."""

    service_name = "file-embedder"

    def __init__(self, user, session) -> None:
        super().__init__(user, session)
        self.upload_manager_url = settings.upload_manager_url
        self.scene_detector_url = settings.scene_detector_url

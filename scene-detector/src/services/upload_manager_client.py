"""Client for communicating with the Upload Manager service."""
import logging
import httpx
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

from src.config.settings import settings
from src.decorators.singleton import singleton
from src.services.HttpClientService import HttpClient
from src.models.events import UpdateFileStatusParams

logger = logging.getLogger(__name__)


class UploadManagerEndpoints(Enum):
    GET_FILE_DETAILS = "/upload/{file_id}"
    DELETE_FILE = "/upload/{file_id}"
    LIST_FILES = "/upload"
    UPDATE_FILE = "/upload/{file_id}"


class UploadManagerClient:
    def __init__(self, user, session):
        self.base_url = settings.upload_manager_url
        self.client = HttpClient(user, session)
        self.timeout = 30.0

    async def update_file_status(
        self,
        file_id: str,
        params: UpdateFileStatusParams
    ) -> Dict[str, Any]:
        try:
            url = f"{self.base_url}{UploadManagerEndpoints.UPDATE_FILE.value.format(file_id=file_id)}"
            payload = {}
            allowed_fields = [
                "processingStatus",
                "processingStage",
                "metadata",
                "errorMessage",
                "processingStartedAt",
                "processingCompletedAt"
            ]

            for field in allowed_fields:
                value = getattr(params, field)
                if value is not None:
                    if isinstance(value, datetime):
                        payload[field] = value.isoformat() + 'Z'
                    else:
                        payload[field] = value  
            

            response = await self.client.send_request('PUT', url, json_data=payload)
            return response
        except Exception as e:
            logger.error(f"Unexpected error updating file {file_id}: {e}")
            raise

    async def get_file(self, file_id: str) -> Optional[Dict[str, Any]]:
        try:
            url = f"{self.base_url}{UploadManagerEndpoints.GET_FILE_DETAILS.value.format(file_id=file_id)}"
            response = await self.client.send_request('GET', url)
            return response
        except Exception as e:
            logger.error(f"Unexpected error getting file {file_id}: {e}")
            return None

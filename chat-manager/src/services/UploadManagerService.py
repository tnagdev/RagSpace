"""Service for communicating with upload-manager service"""
import logging
from typing import Optional, Dict, Any, List
from enum import Enum
from src.services.HttpClientService import HttpClient
from src.config import settings

logger = logging.getLogger(__name__)


class UploadManagerEndpoints(Enum):
    GET_FILE_DETAILS = "/upload/{file_id}"
    DELETE_FILE = "/upload/{file_id}"
    LIST_FILES = "/upload"


class UploadManagerService:
    """Client for upload-manager service API"""
    
    def __init__(self, user: Dict[str, Any], session: Dict[str, Any]):
        self.client = HttpClient(user, session)
        self.base_url = settings.upload_manager_url

    async def get_file_details(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch file details from upload-manager service.
        
        Args:
            file_id: The file ID
            
        Returns:
            File details dictionary or None if not found
        """
        try:
            url = f"{self.base_url}{UploadManagerEndpoints.GET_FILE_DETAILS.value.format(file_id=file_id)}"
            logger.info(f"Fetching file details from: {url}")
            return await self.client.send_request("GET", url)
        except Exception as e:
            logger.error(f"Error fetching file details for {file_id}: {e}")
            return None
    
    async def get_files_batch(self, file_ids: List[str]) -> Optional[Dict[str, Any]]:
        """
        Fetch multiple file details in a single batch request.
        Uses the existing GET /upload endpoint with fileIds query parameter.
        
        Args:
            file_ids: List of file IDs to fetch
            
        Returns:
            Dictionary with files array, or None on failure
        """
        try:
            params = {"fileIds": ",".join(file_ids)}
            url = f"{self.base_url}{UploadManagerEndpoints.LIST_FILES.value}"
            logger.info(f"Fetching {len(file_ids)} files from upload-manager")
            return await self.client.send_request("GET", url, params=params)
        except Exception as e:
            logger.error(f"Error fetching files batch: {e}")
            return None
    
    async def list_user_files(
        self,
        page: int = 1,
        limit: int = 20,
        file_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        List all files for the authenticated user.
        
        Args:
            page: Page number (1-indexed)
            limit: Items per page
            file_type: Optional filter by file type
            
        Returns:
            Files list with pagination, or None on failure
        """
        try:
            params = {"page": page, "limit": limit}
            if file_type:
                params["fileType"] = file_type
            
            url = f"{self.base_url}{UploadManagerEndpoints.LIST_FILES.value}"
            logger.info(f"Listing user files (page {page}, limit {limit})")
            return await self.client.send_request("GET", url, params=params)
        except Exception as e:
            logger.error(f"Error listing user files: {e}")
            return None

from src.services.HttpClientService import HttpClient
from src.config import settings
from enum import Enum
from src.models.upload_manager import UploadedFile
from typing import Optional
import logging

class UploadManagerEndpoints(Enum):
    GET_FILE_DETAILS = "/upload/{file_id}"
    DELETE_FILE = "/upload/{file_id}"
    LIST_FILES = "/upload"


logger = logging.getLogger(__name__)

class UploadManagerService:
    def __init__(self, user, session):
        self.client = HttpClient(user, session)
        self.upload_manager_url = settings.upload_manager_url

    async def get_file_details(self, file_id: str) -> Optional[UploadedFile]:
        """
        Fetch file details from upload-manager service.
        
        Args:
            file_id: The file ID
            headers: Optional headers to forward (for authentication)
            
        Returns:
            File details dictionary or None if not found
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.GET_FILE_DETAILS.value.format(file_id=file_id)}"
            logger.info(f"Fetching file details from: {url}")
            return await self.client.send_request("GET", url)
        except Exception as e:
            logger.error(f"Error fetching file details for {file_id}: {e}")
            return None
    
    async def get_files_batch(self, file_ids: list[str]) -> Optional[dict]:
        """
        Fetch multiple file details in a single batch request.
        Uses the existing GET /upload endpoint with fileIds query parameter.
        
        Args:
            file_ids: List of file IDs to fetch
            
        Returns:
            Dictionary mapping file_id to file details, or None on failure
        """
        if not file_ids:
            return {}
        
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.LIST_FILES.value}"
            logger.info(f"Fetching {len(file_ids)} files in batch from: {url}")
            # Use comma-separated string as expected by the endpoint
            params = {"fileIds": ",".join(file_ids)}
            response = await self.client.send_request("GET", url, params=params)
            
            # Response is expected to be a list or paginated result with data array
            files_list = response if isinstance(response, list) else response.get("data", [])
            
            # Convert list response to dict for easier lookup
            if files_list:
                return {file["id"]: file for file in files_list}
            return {}
        except Exception as e:
            logger.error(f"Error fetching files batch: {e}")
            return None
    
    async def delete_file(self, file_id: str) -> bool:
        """
        Delete a file from upload-manager service.
        
        Args:
            file_id: The file ID
            
        Returns:
            True if deletion was successful, False otherwise
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.DELETE_FILE.value.format(file_id=file_id)}"
            logger.info(f"Deleting file at: {url}")
            response = await self.client.send_request("DELETE", url)
            return response is not None
        except Exception as e:
            logger.error(f"Error deleting file {file_id}: {e}")
            return False
        
    async def list_files(self) -> Optional[list]:
        """
        List all files from upload-manager service.
        
        Returns:
            List of files or None on failure
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.LIST_FILES.value}"
            logger.info(f"Listing files from: {url}")
            return await self.client.send_request("GET", url)
        except Exception as e:
            logger.error(f"Error listing files: {e}")
            return None
    
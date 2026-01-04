from src.services.HttpClientService import HttpClient
from src.config import settings
from enum import Enum
from src.models.upload_manager import UploadedFile
from src.services.LLMService import ImageDescription
from typing import Optional
import logging

class UploadManagerEndpoints(Enum):
    GET_FILE_DETAILS = "/upload/{file_id}"
    DELETE_FILE = "/upload/{file_id}"
    LIST_FILES = "/upload"
    CREATE_METADATA = "/metadata"
    UPSERT_METADATA = "/metadata/upsert"
    GET_METADATA_BY_FILE = "/metadata/file/{file_id}"
    GET_METADATA_BY_SCENE = "/metadata/scene/{scene_id}"


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
    
    async def create_file_metadata(
        self,
        file_id: str,
        source_type: str,
        description: ImageDescription,
        scene_id: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Create metadata for a file or scene in upload-manager.
        
        Args:
            file_id: The file ID
            source_type: IMAGE, VIDEO, or SCENE
            description: ImageDescription from LLM
            scene_id: Optional scene ID for scene-level metadata
            
        Returns:
            Created metadata record or None on failure
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.CREATE_METADATA.value}"
            payload = {
                "fileId": file_id,
                "sourceType": source_type,
                "summary": description.summary,
                "objects": description.objects,
                "setting": description.setting,
                "style": description.style,
                "colors": description.colors,
                "rawResponse": description.model_dump(),
            }
            if scene_id:
                payload["sceneId"] = scene_id
            
            logger.info(f"Creating metadata for file {file_id}, scene {scene_id}")
            return await self.client.send_request("POST", url, json=payload)
        except Exception as e:
            logger.error(f"Error creating metadata for file {file_id}: {e}")
            return None
    
    async def upsert_file_metadata(
        self,
        file_id: str,
        source_type: str,
        description: ImageDescription,
        scene_id: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Upsert metadata for a file or scene (create or update).
        
        Args:
            file_id: The file ID
            source_type: IMAGE, VIDEO, or SCENE
            description: ImageDescription from LLM
            scene_id: Optional scene ID for scene-level metadata
            
        Returns:
            Upserted metadata record or None on failure
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.UPSERT_METADATA.value}"
            payload = {
                "fileId": file_id,
                "sourceType": source_type,
                "summary": description.summary,
                "objects": description.objects,
                "setting": description.setting,
                "style": description.style,
                "colors": description.colors,
                "rawResponse": description.model_dump(),
            }
            if scene_id:
                payload["sceneId"] = scene_id
            
            logger.info(f"Upserting metadata for file {file_id}, scene {scene_id}")
            return await self.client.send_request("POST", url, json=payload)
        except Exception as e:
            logger.error(f"Error upserting metadata for file {file_id}: {e}")
            return None
    
    async def get_metadata_by_file(self, file_id: str) -> Optional[list]:
        """
        Get all metadata for a file.
        
        Args:
            file_id: The file ID
            
        Returns:
            List of metadata records or None on failure
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.GET_METADATA_BY_FILE.value.format(file_id=file_id)}"
            logger.info(f"Fetching metadata for file {file_id}")
            return await self.client.send_request("GET", url)
        except Exception as e:
            logger.error(f"Error fetching metadata for file {file_id}: {e}")
            return None
    
    async def get_metadata_by_scene(self, scene_id: str) -> Optional[dict]:
        """
        Get metadata for a specific scene.
        
        Args:
            scene_id: The scene ID
            
        Returns:
            Metadata record or None on failure
        """
        try:
            url = f"{self.upload_manager_url}{UploadManagerEndpoints.GET_METADATA_BY_SCENE.value.format(scene_id=scene_id)}"
            logger.info(f"Fetching metadata for scene {scene_id}")
            return await self.client.send_request("GET", url)
        except Exception as e:
            logger.error(f"Error fetching metadata for scene {scene_id}: {e}")
            return None
    
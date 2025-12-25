"""Service for communicating with scene-detector service"""
import logging
from typing import Optional, Dict, Any, List
from enum import Enum
from pydantic import BaseModel, validate_call
from src.services.HttpClientService import HttpClient
from src.config import settings

logger = logging.getLogger(__name__)


class SceneDetectorEndpoints(Enum):
    GET_SCENES = "/scenes"


class GetScenesParams(BaseModel):
    """Parameters for getting scenes"""
    file_id: Optional[str] = None
    scene_ids: Optional[List[str]] = None
    start_time_gte: Optional[float] = None
    start_time_lte: Optional[float] = None
    end_time_gte: Optional[float] = None
    end_time_lte: Optional[float] = None


class SceneDetectionService:
    """Client for scene-detector service API"""
    
    def __init__(self, user: Dict[str, Any], session: Dict[str, Any]):
        self.client = HttpClient(user, session)
        self.base_url = settings.scene_detector_url

    @validate_call
    async def get_scenes(
        self,
        params: GetScenesParams
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Fetch scenes from scene-detector service.
        
        Args:
            params: Query parameters for filtering scenes
            
        Returns:
            List of scenes or None if error
        """
        try:
            # Convert Pydantic model to dict, excluding None values
            query_params = params.model_dump(exclude_none=True)
            
            # Convert scene_ids list to comma-separated string if present
            if "scene_ids" in query_params and query_params["scene_ids"]:
                query_params["scene_ids"] = ",".join(query_params["scene_ids"])
            
            url = f"{self.base_url}{SceneDetectorEndpoints.GET_SCENES.value}"
            logger.info(f"Fetching scenes with params: {query_params}")
            return await self.client.send_request("GET", url, params=query_params)
        except Exception as e:
            logger.error(f"Error fetching scenes: {e}")
            return None
    
    async def get_file_scenes(self, file_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Convenience method to get all scenes for a specific file.
        
        Args:
            file_id: The file ID
            
        Returns:
            List of scenes or None if error
        """
        params = GetScenesParams(file_id=file_id)
        return await self.get_scenes(params)

from src.services.HttpClientService import HttpClient
from src.config import settings
from enum import Enum
from typing import Optional
import logging
from typing import Optional, List
from pydantic import validate_call, ValidationError, BaseModel
from src.models.scene_detector import Scene

class SceneDetectorEndpoints(Enum):
    GET_SCENES = "/scenes"


class GetScenesParams(BaseModel):
    file_id: str = None
    scene_ids: Optional[List[str]] = None
    start_time_gte: Optional[float] = None
    start_time_lte: Optional[float] = None
    end_time_gte: Optional[float] = None
    end_time_lte: Optional[float] = None


logger = logging.getLogger(__name__)

class SceneDetectionService:
    def __init__(self, user, session):
        self.client = HttpClient(user, session)

    @validate_call
    async def get_scenes(
        self,
        params: GetScenesParams
    ) -> Optional[List[Scene]]:
        """
        Fetch scenes from scene-detector service.
        
        Args:
            file_id: Filter by file ID
            scene_ids: Filter by specific scene IDs
            start_time_gte: Filter scenes where startTime >= value
            start_time_lte: Filter scenes where startTime <= value
            end_time_gte: Filter scenes where endTime >= value
            end_time_lte: Filter scenes where endTime <= value
            headers: Optional headers to forward (for authentication)
            
        Returns:
            Scenes response dictionary or None if error
        """
        try:
            url = f"{settings.scene_detector_url}{SceneDetectorEndpoints.GET_SCENES.value}"
            logger.info(f"Fetching scenes from: {url}")
            return await self.client.send_request(method="GET", params=params.model_dump(exclude_none=True), url=url)
        except ValidationError as e:
            logger.error(f"Validation error fetching scenes: {e}")
            return None
        except Exception as e:
            logger.error(f"Error fetching scenes: {e}")
            return None
    
    async def get_scenes_batch(self, file_ids: List[str]) -> Optional[dict]:
        """
        Fetch scenes for multiple files in a single batch request.
        Uses the existing GET /scenes endpoint with file_ids query parameter.
        
        Args:
            file_ids: List of file IDs to fetch scenes for
            
        Returns:
            Dictionary mapping file_id to list of scenes, or None on failure
        """
        if not file_ids:
            return {}
        
        try:
            url = f"{settings.scene_detector_url}{SceneDetectorEndpoints.GET_SCENES.value}"
            logger.info(f"Fetching scenes for {len(file_ids)} files in batch from: {url}")
            # Use comma-separated string as expected by the endpoint
            params = {"file_ids": ",".join(file_ids)}
            response = await self.client.send_request(
                method="GET", 
                params=params, 
                url=url
            )
            
            # Group scenes by file_id
            if response and response.get("scenes"):
                scenes_by_file = {}
                for scene in response["scenes"]:
                    file_id = scene.get("fileId")
                    if file_id:
                        if file_id not in scenes_by_file:
                            scenes_by_file[file_id] = []
                        scenes_by_file[file_id].append(scene)
                return scenes_by_file
            return {}
        except Exception as e:
            logger.error(f"Error fetching scenes batch: {e}")
            return None
    
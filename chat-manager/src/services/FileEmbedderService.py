"""Service for communicating with file-embedder service"""
import logging
from typing import List, Optional, Dict, Any
from enum import Enum
from src.services.HttpClientService import HttpClient
from src.config import settings

logger = logging.getLogger(__name__)


class FileEmbedderEndpoints(Enum):
    SEARCH = "/embed/search/advanced"
    VIDEO_CONTENT = "/embed/content/video"
    FILE_CONTENT = "/embed/content/file"


class FileEmbedderService:
    """Client for file-embedder service API"""
    
    def __init__(self, user: Dict[str, Any], session: Dict[str, Any]):
        self.client = HttpClient(user, session)
        self.base_url = settings.file_embedder_url
    
    async def search(
        self,
        query: str,
        user_id: str,
        file_ids: Optional[List[str]] = None,
        max_results: int = 50,
        use_dynamic_retrieval: bool = True,
        adaptive_scoring: bool = True,
        enable_query_expansion: bool = True,
        use_enhanced: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Perform semantic search via file-embedder service.
        
        Args:
            query: Search query text
            user_id: User ID for filtering results
            file_ids: Optional list of file IDs to filter by
            max_results: Maximum number of results
            
        Returns:
            Search results from file-embedder or None on failure
        """
        try:
            payload = {
                "query": query,
                "user_id": user_id,
                "top_k": max_results,
                "use_dynamic_retrieval": use_dynamic_retrieval,
                "adaptive_scoring": adaptive_scoring,
                "enable_query_expansion": enable_query_expansion,
                "use_enhanced": use_enhanced,
                "image_weight": 0.5,
                "text_weight": 0.5
            }
            
            # Add file_ids filter if specified (at top level, not nested in filters)
            if file_ids:
                payload["file_ids"] = file_ids
                logger.info(f"Searching with file_ids filter: {file_ids}")
            
            logger.info(f"Searching file-embedder with query: {query[:50]}... payload: {payload}")
            
            url = f"{self.base_url}{FileEmbedderEndpoints.SEARCH.value}"
            return await self.client.send_request("POST", url, json_data=payload)
            
        except Exception as e:
            logger.error(f"File embedder search failed: {e}", exc_info=True)
            raise Exception(f"Search service unavailable: {str(e)}")

    async def get_video_content(
        self,
        file_id: str,
        include_metadata: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get ALL content for a video file, ordered chronologically.
        Used for video summarization, narration, and story reconstruction.
        
        Args:
            file_id: The video file ID
            include_metadata: Whether to include scene metadata (descriptions, etc.)
            
        Returns:
            Complete video content with scenes, transcripts, and summary context
        """
        try:
            payload = {
                "file_id": file_id,
                "include_metadata": include_metadata
            }
            
            logger.info(f"Getting full video content for file: {file_id}")
            
            url = f"{self.base_url}{FileEmbedderEndpoints.VIDEO_CONTENT.value}"
            return await self.client.send_request("POST", url, json_data=payload)
            
        except Exception as e:
            logger.error(f"Failed to get video content: {e}", exc_info=True)
            raise Exception(f"Video content service unavailable: {str(e)}")

    async def get_file_content(
        self,
        file_id: str,
        include_metadata: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get content and metadata for any file type (image, audio, or video).
        Used for describing images, retrieving audio transcripts, and file analysis.
        
        Args:
            file_id: The file ID
            include_metadata: Whether to include metadata (descriptions, objects, etc.)
            
        Returns:
            File content with metadata and summary context
        """
        try:
            payload = {
                "file_id": file_id,
                "include_metadata": include_metadata
            }
            
            logger.info(f"Getting file content for file: {file_id}")
            
            url = f"{self.base_url}{FileEmbedderEndpoints.FILE_CONTENT.value}"
            return await self.client.send_request("POST", url, json_data=payload)
            
        except Exception as e:
            logger.error(f"Failed to get file content: {e}", exc_info=True)
            raise Exception(f"File content service unavailable: {str(e)}")

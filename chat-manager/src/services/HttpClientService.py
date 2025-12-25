"""HTTP client for making requests to other microservices."""
import httpx
import logging
import json
from typing import Dict, Any, Optional
from src.config import settings

logger = logging.getLogger(__name__)


class HttpClient:
    """HTTP client for inter-service communication."""
    
    def __init__(self, user: Dict[str, Any], session: Dict[str, Any]):
        self.timeout = httpx.Timeout(30.0, connect=10.0)
        self.file_embedder_url = settings.file_embedder_url
        self.upload_manager_url = settings.upload_manager_url
        self.scene_detector_url = settings.scene_detector_url
        self.user = user
        self.session = session
    
    async def send_request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Send an HTTP request with user context.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: The URL to send the request to
            headers: Optional headers to include
            params: Optional query parameters
            json_data: Optional JSON body data
            
        Returns:
            Response JSON as a dictionary or None on failure
        """
        try:
            logger.info(f"Sending {method} request to: {url}")
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                request_headers = headers or {}
                request_headers['x-user'] = json.dumps(self.user)
                request_headers['x-session'] = json.dumps(self.session)
                request_headers['x-service'] = 'chat-manager'
                
                response = await client.request(
                    method,
                    url,
                    headers=request_headers,
                    params=params or {},
                    json=json_data
                )
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error during {method} request to {url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during {method} request to {url}: {e}")
            return None

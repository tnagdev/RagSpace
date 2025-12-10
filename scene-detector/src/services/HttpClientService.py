"""HTTP client for making requests to other microservices."""
import httpx
import logging
import json
from typing import Dict, Any, Optional, List
from src.config.settings import settings

logger = logging.getLogger(__name__)


class HttpClient:
    """HTTP client for inter-service communication."""
    
    def __init__(self, user, session):
        self.timeout = httpx.Timeout(30.0, connect=10.0)
        self.upload_manager_url = settings.upload_manager_url
        self.user = user
        self.session = session
    

    async def send_request(self, method: str, url: str, headers: Optional[Dict[str, str]] = None, params: Optional[Dict[str, Any]] = None, json_data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        Send an HTTP request.
        
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
                headers = headers or {}
                # Convert Pydantic models to dict if needed
                user_data = self.user.model_dump() if hasattr(self.user, 'model_dump') else self.user
                session_data = self.session.model_dump() if hasattr(self.session, 'model_dump') else self.session
                headers['x-user'] = json.dumps(user_data)
                headers['x-session'] = json.dumps(session_data)
                headers['x-service'] = 'scene-detector'
                response = await client.request(method, url, headers=headers or {}, params=params or {}, json=json_data or {})
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error during {method} request to {url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during {method} request to {url}: {e}")
            return None
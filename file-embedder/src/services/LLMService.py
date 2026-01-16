"""LLM service for image description generation using NVIDIA API"""
import logging
import base64
import asyncio
import re
import json
from typing import Optional
from openai import AsyncOpenAI, RateLimitError
from pydantic import BaseModel
from src.config import settings
from src.decorators import singleton

logger = logging.getLogger(__name__)


class ImageDescription(BaseModel):
    """Structured output for image description"""
    summary: str
    objects: list[str]
    setting: str
    style: str
    colors: list[str]


# Semaphore to limit concurrent LLM requests (rate limiting)
_llm_semaphore: asyncio.Semaphore = None


def get_llm_semaphore() -> asyncio.Semaphore:
    """Get or create the LLM rate limiting semaphore"""
    global _llm_semaphore
    if _llm_semaphore is None:
        _llm_semaphore = asyncio.Semaphore(settings.llm_max_concurrent_requests)
    return _llm_semaphore


@singleton
class LLMService:
    """Service for handling LLM interactions with NVIDIA API via OpenAI SDK"""
    
    def __init__(self):
        # Skip if already initialized
        if hasattr(self, 'model') and self.model is not None:
            return
            
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url
            )
        self.model = settings.llm_model
    
    def _encode_image_to_base64(self, image_path: str) -> str:
        """Encode an image file to base64 string"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    
    def _get_image_mime_type(self, image_path: str) -> str:
        """Get MIME type based on file extension"""
        extension = image_path.lower().split(".")[-1]
        mime_types = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
        }
        return mime_types.get(extension, "image/jpeg")
    
    def _extract_json(self, text: str) -> Optional[dict]:
        """Extract JSON from response text, handling various formats"""
        text = text.strip()
        
        # Try to extract JSON if wrapped in markdown code blocks
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json or ```) and last line (```)
            if lines[-1].strip() == "```":
                text = "\n".join(lines[1:-1])
            else:
                text = "\n".join(lines[1:])
        
        # Try direct JSON parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Try to find JSON object in text using regex
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Try to fix common JSON issues (single quotes instead of double)
        try:
            fixed_text = text.replace("'", '"')
            return json.loads(fixed_text)
        except json.JSONDecodeError:
            pass
        
        return None
    
    async def generate_image_description(self, image_path: str, max_retries: int = 3) -> Optional[ImageDescription]:
        """
        Generate a structured text description for an image using vision LLM.
        
        Args:
            image_path: Path to the image file
            max_retries: Maximum number of retries on rate limit errors
            
        Returns:
            ImageDescription object with summary, objects, setting, style, colors
            or None if generation failed
        """
        if not self.client:
            logger.error("LLM client not configured")
            return None
        
        semaphore = get_llm_semaphore()
        
        async with semaphore:
            for attempt in range(max_retries):
                try:
                    # Encode image to base64
                    base64_image = self._encode_image_to_base64(image_path)
                    mime_type = self._get_image_mime_type(image_path)
                    
                    # Build the prompt for structured output
                    system_prompt = """You are an image analysis assistant. Analyze the given image and provide a structured description.
Return your response as valid JSON with the following fields:
- summary: A 1-2 sentence descriptive summary of the image content
- objects: An array of key objects/subjects visible in the image
- setting: The context or environment of the image (e.g., "city street at night", "forest clearing")
- style: The artistic or visual style if applicable (e.g., "photorealistic", "anime", "cyberpunk lighting")
- colors: An array of dominant colors in the image (max 5 colors)

Respond ONLY with valid JSON, no additional text."""

                    user_content = [
                        {"type": "text", "text": "Analyze this image and provide a structured description as JSON:"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                    
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        max_tokens=512,
                        temperature=0.3  # Lower temperature for more consistent structured output
                    )
                    
                    # Parse the response
                    response_text = response.choices[0].message.content.strip()
                    
                    # Extract and parse JSON
                    data = self._extract_json(response_text)
                    if data is None:
                        logger.warning(f"Could not parse JSON from LLM response for {image_path}: {response_text[:100]}")
                        return None
                    
                    description = ImageDescription(**data)
                    
                    logger.info(f"Generated description for {image_path}: {description.summary[:50]}...")
                    return description
                    
                except RateLimitError as e:
                    wait_time = (2 ** attempt) + 1  # Exponential backoff: 2, 3, 5 seconds
                    if attempt < max_retries - 1:
                        logger.warning(f"Rate limited, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"Rate limit exceeded after {max_retries} retries for {image_path}")
                        return None
                        
                except Exception as e:
                    logger.error(f"Error generating image description for {image_path}: {e}", exc_info=True)
                    return None
        
        return None

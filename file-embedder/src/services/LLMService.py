"""LLM service for image description generation using NVIDIA API"""
import logging
import base64
from typing import Optional
from openai import AsyncOpenAI
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


@singleton
class LLMService:
    """Service for handling LLM interactions with NVIDIA API via OpenAI SDK"""
    
    def __init__(self):
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
    
    async def generate_image_description(self, image_path: str) -> Optional[ImageDescription]:
        """
        Generate a structured text description for an image using vision LLM.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            ImageDescription object with summary, objects, setting, style, colors
            or None if generation failed
        """
        if not self.client:
            logger.error("LLM client not configured")
            return None
        
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
            
            # Try to extract JSON if wrapped in markdown code blocks
            if response_text.startswith("```"):
                # Remove markdown code block
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
            
            # Parse and validate with Pydantic
            import json
            data = json.loads(response_text)
            description = ImageDescription(**data)
            
            logger.info(f"Generated description for {image_path}: {description.summary[:50]}...")
            return description
            
        except Exception as e:
            logger.error(f"Error generating image description for {image_path}: {e}", exc_info=True)
            return None

"""LLM service for image description generation using NVIDIA API."""
import logging
import base64
import asyncio
import re
import json
from pathlib import Path
from typing import Optional
from openai import AsyncOpenAI, RateLimitError, APITimeoutError
from pydantic import BaseModel, ValidationError
from src.config import settings
from src.decorators.singleton import SingletonMeta
from src.prompts import load_prompt

logger = logging.getLogger(__name__)


class ImageDescription(BaseModel):
    """Structured output for image description."""
    summary: str
    objects: list[str]
    setting: str
    style: str
    colors: list[str]


_llm_semaphore: Optional[asyncio.Semaphore] = None


def get_llm_semaphore() -> asyncio.Semaphore:
    """Get or create the LLM rate limiting semaphore."""
    global _llm_semaphore
    if _llm_semaphore is None:
        _llm_semaphore = asyncio.Semaphore(settings.llm_max_concurrent_requests)
    return _llm_semaphore



class LLMService(metaclass=SingletonMeta):
    """Service for handling LLM interactions with NVIDIA API via OpenAI SDK."""
    
    MIME_TYPES = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
    }
    
    def __init__(self) -> None:
        # Skip if already initialized (prevents duplicate initialization)
        if hasattr(self, '_llm_service_initialized'):
            return
        
        self._llm_service_initialized = True
        
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured - LLM features disabled")
            self.client = None
            self.model = None
        else:
            self.client = AsyncOpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url,
                # Disable the openai client's own retry loop — our LLMService retry
                # logic handles both rate-limit and timeout errors and is the single
                # source of truth. Without this, a 504 from NVIDIA could hold the
                # consumer for timeout × 2 openai retries × N LLMService attempts.
                timeout=settings.llm_request_timeout,
                max_retries=0,
            )
            self.model = settings.llm_model
            logger.info(f"LLM service initialized with model: {self.model}")
    
    @staticmethod
    def _encode_image_to_base64(image_path: str) -> str:
        """Encode an image file to base64 string."""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    
    @classmethod
    def _get_image_mime_type(cls, image_path: str) -> str:
        """Get MIME type based on file extension."""
        extension = Path(image_path).suffix.lstrip('.').lower()
        return cls.MIME_TYPES.get(extension, "image/jpeg")
    
    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        """Extract JSON from response text, handling various formats."""
        text = text.strip()
        
        # Remove markdown code blocks
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        
        # Try direct JSON parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Extract JSON object using regex
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Attempt to fix single quotes
        try:
            return json.loads(text.replace("'", '"'))
        except json.JSONDecodeError:
            pass
        
        return None
    
    async def generate_image_description(
        self,
        image_path: str,
        max_retries: int = settings.llm_max_retries,
        json_retry_count: int = settings.llm_json_retry_count,
    ) -> Optional[ImageDescription]:
        """Generate a structured text description for an image using vision LLM.
        
        Args:
            image_path: Path to the image file
            max_retries: Maximum number of retries on rate limit errors
            json_retry_count: Number of times to retry if JSON parsing fails
            
        Returns:
            ImageDescription object or None if generation failed
        """
        if not self.client:
            logger.error("LLM client not configured")
            return None
        
        semaphore = get_llm_semaphore()
        
        async with semaphore:
            for attempt in range(max_retries):
                try:
                    base64_image = self._encode_image_to_base64(image_path)
                    mime_type = self._get_image_mime_type(image_path)
                    
                    system_prompt = load_prompt("image_description_system")
                    user_text = load_prompt("image_description_user")
                    
                    user_content = [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}
                        }
                    ]
                    
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        max_tokens=512,
                        temperature=0.3
                    )
                    
                    response_text = response.choices[0].message.content.strip()
                    data = self._extract_json(response_text)
                    
                    if data is None:
                        logger.warning(f"Could not parse JSON from LLM response: {response_text[:100]}")
                        
                        # Retry with explicit JSON formatting request
                        for json_attempt in range(json_retry_count):
                            try:
                                logger.info(f"Retrying with JSON formatting request (attempt {json_attempt + 1}/{json_retry_count})")
                                
                                retry_response = await self.client.chat.completions.create(
                                    model=self.model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_content},
                                        {"role": "assistant", "content": response_text},
                                        {
                                            "role": "user", 
                                            "content": "Please reformat your previous response as valid JSON only, with no additional text or markdown formatting. Use this exact structure: {\"summary\": \"...\", \"objects\": [...], \"setting\": \"...\", \"style\": \"...\", \"colors\": [...]}"
                                        }
                                    ],
                                    max_tokens=512,
                                    temperature=0.1
                                )
                                
                                retry_text = retry_response.choices[0].message.content.strip()
                                data = self._extract_json(retry_text)
                                
                                if data is not None:
                                    logger.info("Successfully parsed JSON after retry")
                                    break
                                else:
                                    logger.warning(f"JSON parsing failed again on retry {json_attempt + 1}: {retry_text[:100]}")
                                    
                            except Exception as retry_error:
                                logger.error(f"Error during JSON retry: {retry_error}")
                                continue
                        
                        if data is None:
                            logger.error(f"Skipping image after {json_retry_count} JSON parsing retries")
                            return None
                    
                    try:
                        description = ImageDescription(**data)
                        logger.info(f"Generated description for {Path(image_path).name}: {description.summary[:50]}...")
                        return description
                    except ValidationError as e:
                        logger.error(f"Invalid description structure: {e}")
                        return None
                    
                except (RateLimitError, APITimeoutError) as e:
                    wait_time = (2 ** attempt) + 1
                    if attempt < max_retries - 1:
                        logger.warning(
                            f"LLM {type(e).__name__}, retrying in {wait_time}s "
                            f"(attempt {attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"LLM {type(e).__name__} after {max_retries} retries")
                        return None

                except Exception as e:
                    logger.error(f"Error generating description for {image_path}: {e}", exc_info=True)
                    return None
        
        return None

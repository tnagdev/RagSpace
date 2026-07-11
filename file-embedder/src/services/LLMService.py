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
    characters_present: list[str] = []


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
    
    def _build_scene_system_prompt(
        self,
        character_registry: dict | None,
        story_context: str,
    ) -> str:
        """Build a character-aware system prompt when registry is available."""
        if not character_registry or not character_registry.get("characters"):
            return load_prompt("image_description_system")

        chars = character_registry["characters"]
        chars_text = "\n".join(
            f"- {c.get('name', '?')} ({c.get('id', '?')}): {c.get('role', '')}."
            f" {c.get('description', '')}."
            f" Also called: {', '.join(c.get('aliases', []))}"
            for c in chars
        )
        context = story_context or character_registry.get("story_context", "")
        return (
            "You are a video scene analysis assistant. Your only output is a single JSON object"
            " — no prose, no markdown, no explanation.\n\n"
            f"KNOWN CHARACTERS:\n{chars_text}\n\n"
            f"STORY CONTEXT: {context}\n\n"
            "Analyze the scene thumbnail. Identify people by cross-referencing their visual "
            "appearance with the known characters above. If dialogue at this timestamp names "
            "someone, use that name.\n\n"
            "Return exactly this JSON structure (output ONLY the JSON, nothing else):\n"
            "{\n"
            '  "summary": "1-2 sentence description using character names where identifiable",\n'
            '  "objects": ["object1", "object2"],\n'
            '  "setting": "location or environment",\n'
            '  "style": "visual style, e.g. cartoon, photorealistic",\n'
            '  "colors": ["color1", "color2"],\n'
            '  "characters_present": ["name of character if present, else leave array empty"]\n'
            "}\n\n"
            "Rules: output ONLY the JSON object. Do not write anything before or after it. "
            "Do not wrap in markdown code blocks."
        )

    def _build_scene_user_text(
        self,
        transcript: str | None,
        scene_index: int | None,
        start_time: float | None,
        end_time: float | None,
    ) -> str:
        """Build user message with scene context when available."""
        if transcript is None and scene_index is None:
            return load_prompt("image_description_user")

        time_str = ""
        if start_time is not None and end_time is not None:
            time_str = f" at {start_time:.1f}s–{end_time:.1f}s"
        scene_str = f"Scene {scene_index + 1}{time_str}" if scene_index is not None else ""
        dialogue_str = (
            f"\nSpoken dialogue at this timestamp: \"{transcript[:500]}\""
            if transcript else ""
        )
        return f"{scene_str}{dialogue_str}\n\nAnalyze this scene thumbnail:"

    async def generate_image_description(
        self,
        image_path: str,
        transcript: str | None = None,
        character_registry: dict | None = None,
        scene_index: int | None = None,
        start_time: float | None = None,
        end_time: float | None = None,
        story_context: str = "",
        max_retries: int = settings.llm_max_retries,
        json_retry_count: int = settings.llm_json_retry_count,
    ) -> Optional[ImageDescription]:
        """Generate a structured text description for an image using vision LLM."""
        if not self.client:
            logger.error("LLM client not configured")
            return None

        semaphore = get_llm_semaphore()

        async with semaphore:
            for attempt in range(max_retries):
                try:
                    base64_image = self._encode_image_to_base64(image_path)
                    mime_type = self._get_image_mime_type(image_path)

                    system_prompt = self._build_scene_system_prompt(character_registry, story_context)
                    user_text = self._build_scene_user_text(transcript, scene_index, start_time, end_time)

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
                                            "content": (
                                                "Please reformat your previous response as valid JSON only, "
                                                "with no additional text or markdown formatting. "
                                                'Use this exact structure: {"summary": "...", "objects": [...], '
                                                '"setting": "...", "style": "...", "colors": [...], "characters_present": []}'
                                            )
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

    async def extract_character_registry(self, full_transcript: str) -> dict:
        """Extract character names and story context from a full video transcript.

        Returns a registry dict with 'characters' list and 'story_context' string.
        Falls back to role labels when names are not found in dialogue.
        """
        if not self.client:
            return {"characters": [], "story_context": ""}

        # Keep first ~8 000 chars (~2 000 tokens) to stay within model limits
        excerpt = full_transcript[:8000] + ("..." if len(full_transcript) > 8000 else "")

        system_prompt = (
            "You are a video content analyst. Extract character information from a video transcript.\n\n"
            "Identify all people/characters mentioned or implied:\n"
            "1. Use their actual names if spoken or mentioned\n"
            "2. If no names found, use role labels: \"the host\", \"narrator\", \"character_1\", etc.\n"
            "3. Infer relationships and roles from context\n\n"
            "Return ONLY valid JSON with no other text:\n"
            "{\n"
            '  "characters": [\n'
            '    {\n'
            '      "id": "char_1",\n'
            '      "name": "actual name or role label",\n'
            '      "role": "brief role (e.g. host, protagonist, teacher)",\n'
            '      "description": "what we know about them from the transcript",\n'
            '      "aliases": ["other ways they are referred to"]\n'
            '    }\n'
            '  ],\n'
            '  "story_context": "1-2 sentence description of what this video is about"\n'
            "}\n\n"
            "If no meaningful characters can be identified return "
            '{"characters": [], "story_context": "Content could not be determined from transcript."}'
        )

        semaphore = get_llm_semaphore()
        async with semaphore:
            for attempt in range(3):
                try:
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Extract characters from this transcript:\n\n{excerpt}"}
                        ],
                        max_tokens=1024,
                        temperature=0.2,
                    )
                    text = response.choices[0].message.content.strip()
                    data = self._extract_json(text)
                    if data and "characters" in data:
                        logger.info(f"Extracted {len(data['characters'])} characters from transcript")
                        return data
                    logger.warning(f"Character registry: invalid JSON on attempt {attempt + 1}: {text[:100]}")
                except (RateLimitError, APITimeoutError) as e:
                    wait_time = (2 ** attempt) + 1
                    if attempt < 2:
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"Character registry extraction failed: {e}")
                except Exception as e:
                    logger.error(f"Character registry extraction error: {e}")
                    break

        return {"characters": [], "story_context": ""}

    async def generate_narrative_summary(
        self,
        full_transcript: str,
        scene_summaries: list[dict],
        character_registry: dict,
    ) -> dict | None:
        """Generate a holistic narrative summary after all scenes are described.

        Captures story arc, themes, character roles, and key events that individual
        scene descriptions lose when processed in isolation.
        """
        if not self.client:
            return None

        chars = character_registry.get("characters", [])
        chars_text = "\n".join(
            f"- {c.get('name', '?')} ({c.get('id', '?')}): {c.get('role', '')}. {c.get('description', '')}"
            for c in chars
        ) if chars else "No named characters identified."

        scenes_text = "\n".join(
            f"Scene {s.get('scene', i + 1)} [{s.get('time', '')}]: {s.get('description', '')}"
            + (f" | Spoken: {s.get('transcript', '')[:120]}" if s.get("transcript") else "")
            for i, s in enumerate(scene_summaries[:60])
        )

        transcript_excerpt = full_transcript[:4000] + ("..." if len(full_transcript) > 4000 else "")

        system_prompt = (
            "You are a video narrative analyst. Create a comprehensive summary based on scene descriptions and transcript.\n\n"
            "Return ONLY valid JSON:\n"
            "{\n"
            '  "summary": "2-3 sentence overview of the entire video",\n'
            '  "themes": ["theme1", "theme2"],\n'
            '  "story_arc": "How the content progresses from start to finish",\n'
            '  "character_arcs": {"char_id": "Brief description of their journey/role throughout"},\n'
            '  "key_events": [\n'
            '    {"time": "Xs-Ys", "event": "What happens at this point"}\n'
            '  ]\n'
            "}"
        )
        user_content = (
            f"CHARACTERS:\n{chars_text}\n\n"
            f"TRANSCRIPT EXCERPT:\n{transcript_excerpt}\n\n"
            f"SCENE DESCRIPTIONS (chronological):\n{scenes_text}\n\n"
            "Create a narrative summary of this video."
        )

        semaphore = get_llm_semaphore()
        async with semaphore:
            for attempt in range(3):
                try:
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        max_tokens=1024,
                        temperature=0.2,
                    )
                    text = response.choices[0].message.content.strip()
                    data = self._extract_json(text)
                    if data and "summary" in data:
                        logger.info(f"Generated narrative summary with {len(data.get('themes', []))} themes")
                        return data
                    logger.warning(f"Narrative summary: invalid JSON on attempt {attempt + 1}: {text[:100]}")
                except (RateLimitError, APITimeoutError) as e:
                    wait_time = (2 ** attempt) + 1
                    if attempt < 2:
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"Narrative summary generation failed: {e}")
                except Exception as e:
                    logger.error(f"Narrative summary error: {e}")
                    break

        return None

"""Service for generating personalized AI greetings based on user's file library"""
import logging
from typing import Dict, Any, Optional
from src.services.LLMService import LLMService
from src.services.UploadManagerService import UploadManagerService
from src.models.chat import ChatMessage

logger = logging.getLogger(__name__)


class GreetingService:
    """Generates a witty, personalized one-liner greeting grounded in the user's library"""

    def __init__(self, user: Dict[str, Any], session: Dict[str, Any]):
        self.user = user
        self.session = session
        self.llm = LLMService()
        self.upload_manager = UploadManagerService(user, session)

    async def generate(self) -> Optional[str]:
        """
        Fetch the user's completed files, build a context-aware prompt, and ask
        the LLM for a personalised greeting.

        Returns:
            A short greeting string, or None on failure.
        """
        user_name = self.user.get("name") or "there"
        first_name = user_name.split()[0]

        # Fetch completed files (up to 30 for context)
        filenames = await self._fetch_completed_filenames(limit=30)

        prompt = self._build_prompt(first_name, filenames)
        logger.info(
            f"Generating greeting for user '{first_name}' with {len(filenames)} files"
        )

        try:
            messages = [ChatMessage(role="user", content=prompt)]
            greeting = await self.llm.generate_response(
                messages=messages,
                search_results=None,
                temperature=0.9,   # higher temperature for variety
            )
            # Strip surrounding whitespace/quotes the model occasionally adds
            greeting = greeting.strip().strip('"').strip("'").strip()
            return greeting
        except Exception as e:
            logger.error(f"Failed to generate greeting: {e}", exc_info=True)
            return None

    async def _fetch_completed_filenames(self, limit: int = 30) -> list[str]:
        """Return original filenames for the user's fully processed files."""
        try:
            result = await self.upload_manager.list_user_files(
                page=1,
                limit=limit,
            )
            if not result:
                return []

            files = result.get("files", [])

            # Filter to only fully-processed files (processingStage == COMPLETED)
            completed = [
                f for f in files
                if f.get("processingStage") == "COMPLETED"
                and f.get("uploadStatus") == "COMPLETED"
            ]

            return [f.get("originalFilename") or f.get("filename", "") for f in completed]
        except Exception as e:
            logger.error(f"Failed to fetch files for greeting: {e}", exc_info=True)
            return []

    @staticmethod
    def _build_prompt(first_name: str, filenames: list[str]) -> str:
        if filenames:
            file_list = ", ".join(f'"{n}"' for n in filenames[:15])
            library_description = f"a media library containing: {file_list}"
        else:
            library_description = "an empty media library (no files processed yet)"

        return (
            f"You are a dry, sharp comedian writing UI copy for a media-intelligence platform called RagSpace. "
            f"The user's name is {first_name} and they have {library_description}. "
            f"Write a single one-liner joke or witty quip (12–18 words) that greets {first_name} and "
            f"pokes fun at something specific and observable about their actual file collection — "
            f"the file types, names, quantity, or mix. Make it feel like a roast, not a compliment. "
            f"Be punchy, unexpected, and genuinely funny. "
            f"Do NOT use quotation marks. Do NOT explain yourself. Output ONLY the one-liner."
        )

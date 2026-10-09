import logging

from openai import AsyncOpenAI

from src.config import settings
from src.decorators.singleton import SingletonMeta
from src.graph.prompts import load_prompt

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = load_prompt("summary_system.md")
SUMMARY_TIMEOUT_S = 30.0
MESSAGE_CHARS = 500


class SummaryService(metaclass=SingletonMeta):
    def __init__(self) -> None:
        self.client = (
            AsyncOpenAI(api_key=settings.nvidia_api_key, base_url=settings.nvidia_base_url, timeout=SUMMARY_TIMEOUT_S)
            if settings.nvidia_api_key
            else None
        )

    async def summarize(self, messages: list[dict[str, str]], existing_summary: str | None) -> str | None:
        """Folds messages into the running summary; None means keep the history unsummarized."""
        if self.client is None or not messages:
            return None
        parts = [f"Previous conversation summary:\n{existing_summary}\n\n---\n"] if existing_summary else []
        parts.append("Messages to summarize:\n")
        for message in messages:
            role = "User" if message["role"] == "user" else "Assistant"
            parts.append(f"{role}: {message['content'][:MESSAGE_CHARS]}")
        try:
            response = await self.client.chat.completions.create(
                model=settings.summary_model,
                messages=[
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": "\n".join(parts)},
                ],
                max_tokens=settings.summary_max_tokens,
                temperature=0.3,
            )
        except Exception:
            logger.exception("Conversation summary failed")
            return None
        return (response.choices[0].message.content or "").strip() or None

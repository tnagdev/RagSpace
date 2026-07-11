"""Singleton wrapper around LangChain's ChatOpenAI.

Centralises the NVIDIA API configuration so agent nodes don't each recreate
a client object on every request. ChatOpenAI instances are lightweight (no
persistent connection until the first call), so the singleton primarily avoids
the per-call instantiation ceremony and ensures model names / base URLs are
configured in exactly one place.
"""
import logging
from langchain_openai import ChatOpenAI

from src.config import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class LangChainLLMClient(metaclass=SingletonMeta):
    """Shared factory for LangChain ChatOpenAI instances backed by the NVIDIA API."""

    def __init__(self) -> None:
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured for LangChainLLMClient")
        self._base: dict = {
            "base_url": settings.nvidia_base_url,
            "api_key": settings.nvidia_api_key or "none",
        }
        logger.info("LangChainLLMClient initialised (base_url=%s)", settings.nvidia_base_url)

    def get(self, model: str, timeout: int, streaming: bool = False) -> ChatOpenAI:
        """Return a ChatOpenAI client configured for the given model and timeout."""
        return ChatOpenAI(
            model=model,
            timeout=timeout,
            streaming=streaming,
            max_retries=0,
            **self._base,
        )

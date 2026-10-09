import logging

from langchain_openai import ChatOpenAI

from src.config import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class LangChainLLMClient(metaclass=SingletonMeta):
    def __init__(self) -> None:
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured; LLM calls will fail")
        self._base = {"base_url": settings.nvidia_base_url, "api_key": settings.nvidia_api_key or "none"}

    def get(self, model: str, timeout: float, streaming: bool = False, temperature: float | None = None) -> ChatOpenAI:
        options = {"temperature": temperature} if temperature is not None else {}
        # Retries are handled by callers, which know whether a retry is safe mid-stream.
        return ChatOpenAI(model=model, timeout=timeout, streaming=streaming, max_retries=0, **self._base, **options)

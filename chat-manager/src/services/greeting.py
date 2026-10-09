import logging

import grpc
from langchain_core.messages import HumanMessage
from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2

from src.clients import files_client
from src.config import settings
from src.services.LangChainLLMClient import LangChainLLMClient

logger = logging.getLogger(__name__)

LIBRARY_SAMPLE = 30
NAMES_IN_PROMPT = 15


async def greeting(user_id: str, display_name: str) -> str:
    first_name = (display_name.split() or ["there"])[0]
    if settings.nvidia_api_key:
        names = await _completed_file_names(user_id)
        try:
            llm = LangChainLLMClient().get(
                model=settings.greeting_model, timeout=settings.greeting_timeout, temperature=0.9
            )
            response = await llm.ainvoke([HumanMessage(content=_prompt(first_name, names))])
            text = str(response.content).strip().strip('"').strip("'").strip()
            if text:
                return text
        except Exception:
            logger.exception("Greeting generation failed")
    return f"Hey {first_name}, welcome back to RagSpace!"


async def _completed_file_names(user_id: str) -> list[str]:
    client = files_client()
    try:
        response = await client.stub.ListFiles(
            files_pb2.ListFilesRequest(
                user_id=user_id, page_size=LIBRARY_SAMPLE, processing_status=common_pb2.PROCESSING_STATUS_COMPLETED
            ),
            **client.opts(),
        )
    except grpc.aio.AioRpcError as error:
        logger.warning("Could not list files for greeting: %s", error.code().name)
        return []
    return [file.name for file in response.files]


def _prompt(first_name: str, names: list[str]) -> str:
    library = (
        "a media library containing: " + ", ".join(f'"{n}"' for n in names[:NAMES_IN_PROMPT])
        if names
        else "an empty media library (no files processed yet)"
    )
    return (
        f"You are a dry, sharp comedian writing UI copy for a media-intelligence platform called RagSpace. "
        f"The user's name is {first_name} and they have {library}. "
        f"Write a single one-liner joke or witty quip (12-18 words) that greets {first_name} and "
        f"pokes fun at something specific and observable about their actual file collection: "
        f"the file types, names, quantity, or mix. Make it feel like a roast, not a compliment. "
        f"Be punchy, unexpected, and genuinely funny. "
        f"Do NOT use quotation marks. Do NOT explain yourself. Output ONLY the one-liner."
    )

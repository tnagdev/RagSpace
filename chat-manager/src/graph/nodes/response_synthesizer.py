import asyncio
import logging

import openai
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from ragspace.common.v1 import common_pb2

from src.config import settings
from src.graph.events import step_done
from src.graph.formatters import AGENT_SYSTEM_PROMPT, VIDEO_TYPES
from src.graph.prompts import load_prompt
from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger
from src.services.LangChainLLMClient import LangChainLLMClient

logger = logging.getLogger(__name__)

_SUMMARIZE_INSTRUCTIONS = load_prompt("summarize_instructions.md")
_VIDEO_INSTRUCTIONS = load_prompt("video_instructions.md")
_IMAGE_INSTRUCTIONS = load_prompt("image_instructions.md")
MAX_RATE_LIMIT_RETRIES = 2
AT_CAPACITY = "The AI service is currently at capacity. Please wait a moment and try again."


def build_system_prompt(state: AgentState) -> str:
    attached = state.get("attached_files") or []
    # Gate citation instructions on what the answer draws from, not only on what was attached.
    types = {f.type for f in attached} | {h.file_type for h in state.get("search_results") or []}
    prompt = AGENT_SYSTEM_PROMPT
    if types & set(VIDEO_TYPES):
        prompt += "\n\n" + _VIDEO_INSTRUCTIONS
        if state.get("intent") == "summarize":
            prompt += "\n\n" + _SUMMARIZE_INSTRUCTIONS
    if common_pb2.FILE_TYPE_IMAGE in types:
        prompt += "\n\n" + _IMAGE_INSTRUCTIONS

    if attached:
        attached_types = {f.type for f in attached}
        if attached_types == {common_pb2.FILE_TYPE_IMAGE}:
            label = "Attached image(s)"
        elif attached_types <= set(VIDEO_TYPES):
            label = "Attached video(s)"
        else:
            label = "Attached file(s)"
        prompt += f"\n\n### {label}: {', '.join(f.name for f in attached)}\n"
    if state.get("retrieved_context"):
        prompt += f"\n\n### Relevant context from the user's files:\n{state['retrieved_context']}"
    if state.get("conversation_summary"):
        prompt += (
            f"\n\n### Earlier Conversation Summary:\n{state['conversation_summary']}"
            "\n\n(Recent messages follow below.)"
        )
    return prompt


async def response_synthesizer_node(state: AgentState, config: RunnableConfig) -> dict:
    log = NodeLogger(logger, "response_synthesizer")
    messages = [SystemMessage(content=build_system_prompt(state))]
    for message in state.get("conversation_history") or []:
        cls = AIMessage if message.get("role") == "assistant" else HumanMessage
        messages.append(cls(content=message.get("content", "")))

    llm = LangChainLLMClient().get(
        model=settings.agent_model, timeout=settings.response_synthesizer_timeout, streaming=True
    )
    response = ""
    for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
        response = ""
        try:
            async for chunk in llm.astream(messages):
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    response += chunk.content
            break
        except openai.APIError as error:
            text = str(error)
            rate_limited = "ResourceExhausted" in text or "rate_limit" in text.lower() or "429" in text
            if rate_limited and attempt < MAX_RATE_LIMIT_RETRIES:
                await asyncio.sleep(3.0 * (2**attempt))
                continue
            log.error("llm_failed", exc_info=True)
            response = AT_CAPACITY if rate_limited else "Failed to generate a response. Please try again."
            break

    log.done(response_chars=len(response))
    return {
        "final_response": response,
        "events": [step_done("synthesizer", "Response complete")],
    }

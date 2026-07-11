import asyncio
import logging
import openai
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, AIMessageChunk

from src.config import settings
from src.graph.state import AgentState
from src.graph.formatters import AGENT_SYSTEM_PROMPT
from src.graph.prompts import load_prompt
from src.logging.node_logger import NodeLogger
from src.services.LangChainLLMClient import LangChainLLMClient

logger = logging.getLogger(__name__)

_SUMMARIZE_INSTRUCTIONS = load_prompt("summarize_instructions.md")


async def response_synthesizer_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    intent = state.get("intent") or "search"
    is_summary_request = intent == "summarize"
    retrieved_context = state.get("retrieved_context") or ""
    conversation_history = state.get("conversation_history") or []

    log = NodeLogger(logger, correlation_id, "response_synthesizer")
    log.info(
        "start",
        intent=intent,
        is_summary=is_summary_request,
        context_chars=len(retrieved_context),
        history_msgs=len(conversation_history),
    )

    sse_events = [{"type": "step_start", "step": "synthesizer", "label": "Generating response..."}]

    llm = LangChainLLMClient().get(
        model=settings.agent_model,
        timeout=settings.response_synthesizer_timeout,
        streaming=True,
    )

    # Build the system message: base prompt + optional summarize instructions
    # + attached file list + retrieved context + conversation summary
    system_content = AGENT_SYSTEM_PROMPT

    if is_summary_request:
        system_content += "\n\n" + _SUMMARIZE_INSTRUCTIONS

    attached_files = state.get("attached_files") or []
    if attached_files:
        file_names = [
            f.get("originalFilename") or f.get("original_filename") or f.get("filename") or "Unknown"
            for f in attached_files
        ]
        system_content += f"\n\n### Attached video(s): {', '.join(file_names)}\n"

    if retrieved_context:
        system_content += f"\n\n### Relevant context from the user's files:\n{retrieved_context}"

    log.debug("system_prompt", chars=len(system_content), context_chars=len(retrieved_context))

    conversation_summary = state.get("conversation_summary")
    if conversation_summary:
        system_content += (
            f"\n\n### Earlier Conversation Summary:\n{conversation_summary}"
            "\n\n(Recent messages follow below.)"
        )

    messages_for_llm = [SystemMessage(content=system_content)]
    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "assistant":
            messages_for_llm.append(AIMessage(content=content))
        else:
            messages_for_llm.append(HumanMessage(content=content))

    full_response = ""
    _MAX_RETRIES = 2
    for attempt in range(_MAX_RETRIES + 1):
        try:
            async for chunk in llm.astream(messages_for_llm):
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    full_response += chunk.content
                    # Tokens stream in real-time via the LangGraph messages channel;
                    # do NOT append to sse_events to avoid duplicates.
            break  # success
        except openai.APIError as e:
            error_str = str(e)
            is_rate_limit = "ResourceExhausted" in error_str or "rate_limit" in error_str.lower() or "429" in error_str
            if is_rate_limit and attempt < _MAX_RETRIES:
                wait = 3.0 * (2 ** attempt)  # 3s, 6s
                log.warning("rate_limited_retry", attempt=attempt + 1, wait_s=wait, error=error_str[:100])
                await asyncio.sleep(wait)
                continue
            # Final attempt or non-rate-limit API error — surface via sse_events (no message stream).
            log.error("llm_stream_failed", exc_info=True, error=error_str[:120])
            if is_rate_limit:
                fallback = "The AI service is currently at capacity. Please wait a moment and try again."
            else:
                fallback = f"Failed to generate a response. Please try again. ({error_str[:80]})"
            sse_events.append({"type": "content", "content": fallback})
            full_response = fallback
            break
        except Exception as e:
            log.error("llm_stream_failed", exc_info=True, error=str(e)[:120])
            raise

    sse_events.append({"type": "step_done", "step": "synthesizer", "label": "Response complete"})
    sse_events.append({
        "type": "done",
        "conversation_id": state.get("conversation_id", ""),
        "tools_used": state.get("tools_used", [])
    })

    log.done(response_chars=len(full_response))

    return {"final_response": full_response, "sse_events": sse_events}

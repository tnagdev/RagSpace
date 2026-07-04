import logging
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, AIMessageChunk

from src.config import settings
from src.graph.state import AgentState
from src.graph.formatters import AGENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def response_synthesizer_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")

    logger.info(f"[{correlation_id}] response_synthesizer_node: generating response")

    sse_events = [{"type": "step_start", "step": "synthesizer", "label": "Generating response..."}]

    llm = ChatOpenAI(
        model="meta/llama-3.2-11b-vision-instruct",
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key,
        timeout=120,
        streaming=True
    )

    # Build system message from full prompt + attached file context + retrieved context
    system_content = AGENT_SYSTEM_PROMPT

    attached_files = state.get("attached_files") or []
    if attached_files:
        system_content += f"\n\n### User has attached {len(attached_files)} file(s):\n"
        for f in attached_files:
            file_name = f.get("originalFilename") or f.get("original_filename") or f.get("filename") or "Unknown"
            file_id = f.get("id", "Unknown")
            file_type = f.get("fileType", "Unknown")
            system_content += f"- {file_name} (ID: {file_id}, Type: {file_type})\n"
        system_content += (
            "\nIMPORTANT: The user wants to work with these attached files. "
            "Use search_files to find specific content, or get_video_content to summarize/narrate entire videos."
        )

    retrieved_context = state.get("retrieved_context") or ""
    if retrieved_context:
        system_content += f"\n\n### Relevant context from the user's files:\n{retrieved_context}"

    conversation_summary = state.get("conversation_summary")
    if conversation_summary:
        system_content += f"\n\n### Earlier Conversation Summary:\n{conversation_summary}\n\n(Recent messages follow below.)"

    messages_for_llm = [SystemMessage(content=system_content)]

    for msg in state.get("conversation_history", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "assistant":
            messages_for_llm.append(AIMessage(content=content))
        else:
            messages_for_llm.append(HumanMessage(content=content))

    full_response = ""
    try:
        async for chunk in llm.astream(messages_for_llm):
            if isinstance(chunk, AIMessageChunk) and chunk.content:
                full_response += chunk.content
                sse_events.append({"type": "content", "content": chunk.content})
    except Exception as e:
        logger.error(f"[{correlation_id}] response_synthesizer_node: LLM streaming error: {e}")
        raise

    sse_events.append({"type": "step_done", "step": "synthesizer", "label": "Response complete"})
    sse_events.append({
        "type": "done",
        "conversation_id": state.get("conversation_id", ""),
        "tools_used": state.get("tools_used", [])
    })

    logger.info(f"[{correlation_id}] response_synthesizer_node: generated {len(full_response)} chars")

    return {"final_response": full_response, "sse_events": sse_events}

import logging
from langchain_core.runnables import RunnableConfig

from src.graph.state import AgentState
from src.services.SummaryService import SummaryService
from src.models.chat import ChatMessage

logger = logging.getLogger(__name__)


async def fetch_context_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    upload_manager_service = config["configurable"].get("upload_manager_service")

    logger.info(f"[{correlation_id}] fetch_context_node: loading file context and summarizing if needed")

    sse_events = [{"type": "step_start", "step": "fetch_context", "label": "Loading context..."}]

    updates: dict = {"sse_events": sse_events}

    file_ids = state.get("file_ids") or []
    if file_ids and upload_manager_service:
        try:
            files_response = await upload_manager_service.get_files_batch(file_ids)
            if files_response and "files" in files_response:
                updates["attached_files"] = files_response["files"]
                logger.info(f"[{correlation_id}] fetch_context_node: loaded {len(updates['attached_files'])} attached files")
        except Exception as e:
            logger.warning(f"[{correlation_id}] fetch_context_node: failed to load file details: {e}")

    conversation_history = state.get("conversation_history") or []
    if conversation_history:
        try:
            messages = [
                ChatMessage(role=m["role"], content=m["content"])
                for m in conversation_history
            ]
            summary_service = SummaryService()
            if await summary_service.should_summarize(messages):
                existing_summary = state.get("conversation_summary")
                new_summary, trimmed_messages = await summary_service.get_or_create_summary(
                    messages=messages,
                    existing_summary=existing_summary
                )
                updates["conversation_summary"] = new_summary
                updates["conversation_history"] = [
                    {"role": m.role, "content": m.content} for m in trimmed_messages
                ]
                logger.info(f"[{correlation_id}] fetch_context_node: conversation summarized")
        except Exception as e:
            logger.warning(f"[{correlation_id}] fetch_context_node: summarization failed: {e}")

    sse_events.append({"type": "step_done", "step": "fetch_context", "label": "Context ready"})
    return updates

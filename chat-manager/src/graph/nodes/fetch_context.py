import logging
from langchain_core.runnables import RunnableConfig

from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger
from src.services.SummaryService import SummaryService
from src.models.chat import ChatMessage

logger = logging.getLogger(__name__)


async def fetch_context_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    upload_manager_service = config["configurable"].get("upload_manager_service")

    file_ids = state.get("file_ids") or []
    conversation_history = state.get("conversation_history") or []

    log = NodeLogger(logger, correlation_id, "fetch_context")
    log.info("start", file_ids=len(file_ids), history_msgs=len(conversation_history))

    sse_events = [{"type": "step_start", "step": "fetch_context", "label": "Loading context..."}]
    updates: dict = {"sse_events": sse_events}

    # Load file metadata for all attached files so response_synthesizer can name them.
    if file_ids and upload_manager_service:
        try:
            files_response = await upload_manager_service.get_files_batch(file_ids)
            if files_response and "files" in files_response:
                attached_files = files_response["files"]
                updates["attached_files"] = attached_files
                log.info("files_loaded", count=len(attached_files))
        except Exception as e:
            log.warning("files_failed", error=str(e)[:120])

    # Summarize conversation history if it exceeds the threshold.
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
                    existing_summary=existing_summary,
                )
                updates["conversation_summary"] = new_summary
                updates["conversation_history"] = [
                    {"role": m.role, "content": m.content} for m in trimmed_messages
                ]
                log.info(
                    "summary_triggered",
                    old_msgs=len(messages),
                    new_msgs=len(trimmed_messages),
                )
            else:
                log.info("summary_skipped", msgs=len(messages), reason="below_threshold")
        except Exception as e:
            log.warning("summary_failed", error=str(e)[:120])

    sse_events.append({"type": "step_done", "step": "fetch_context", "label": "Context ready"})
    log.done()
    return updates

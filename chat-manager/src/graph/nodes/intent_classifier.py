import json
import logging
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import settings
from src.graph.state import AgentState
from src.graph.prompts import load_prompt
from src.logging.node_logger import NodeLogger
from src.services.LangChainLLMClient import LangChainLLMClient

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("intent_classifier.md")


async def intent_classifier_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    user_message = state["user_message"]

    log = NodeLogger(logger, correlation_id, "intent_classifier")
    log.info("start", message_preview=user_message[:80])

    step_start_evt = {
        "type": "step_start",
        "step": "intent_classifier",
        "label": "Understanding your question..."
    }

    llm = LangChainLLMClient().get(
        model=settings.agent_model,
        timeout=settings.intent_classifier_timeout,
    )

    messages_for_llm = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=user_message)
    ]

    intent = "search"
    file_types = ["video"]
    query_modality = "both"
    character_name = None
    sse_events = [step_start_evt]

    try:
        response = await llm.ainvoke(messages_for_llm)
        raw = response.content.strip()
        log.debug("llm_raw", response=raw[:300])
        parsed = json.loads(raw)
        intent = parsed.get("intent", "search")
        file_types = parsed.get("file_types", ["video"])
        query_modality = parsed.get("query_modality", "both")
        character_name = parsed.get("character_name")
    except Exception as e:
        log.error("parse_failed", exc_info=True, error=str(e)[:120])
        sse_events.append({
            "type": "step_error",
            "step": "intent_classifier",
            "error": f"Failed to classify intent: {e}",
            "error_code": "PARSE_ERROR",
        })
        # Defaults already set above — continue with fallback values

    _weights_map = {
        "visual":    (0.25, 0.75),
        "audio":     (0.95, 0.05),
        "thematic":  (0.80, 0.20),
        "character": (0.75, 0.25),
        "both":      (0.50, 0.50),
    }
    _tw, _iw = _weights_map.get(query_modality, (0.50, 0.50))

    log.done(
        intent=intent,
        modality=query_modality,
        text_weight=_tw,
        image_weight=_iw,
        character=character_name,
        file_types=file_types,
    )

    sse_events.append({
        "type": "step_done",
        "step": "intent_classifier",
        "label": f"Detected intent: {intent}"
    })

    return {
        "intent": intent,
        "file_types": file_types,
        "query_modality": query_modality,
        "character_name": character_name,
        "sse_events": sse_events,
    }

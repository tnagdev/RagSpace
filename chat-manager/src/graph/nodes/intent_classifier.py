import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from src.config import settings
from src.graph.events import step_done, step_failed, step_started
from src.graph.prompts import load_prompt
from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger
from src.services.LangChainLLMClient import LangChainLLMClient

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = load_prompt("intent_classifier.md")


async def intent_classifier_node(state: AgentState, config: RunnableConfig) -> dict:
    log = NodeLogger(logger, "intent_classifier")
    events = [step_started("intent_classifier", "Understanding your question...")]
    intent, modality = "search", "both"

    llm = LangChainLLMClient().get(model=settings.agent_model, timeout=settings.intent_classifier_timeout)
    try:
        response = await llm.ainvoke([SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=state["user_message"])])
        parsed = json.loads(response.content.strip())
        intent = parsed.get("intent") or intent
        modality = parsed.get("query_modality") or modality
    except Exception as error:
        log.error("classification_failed", exc_info=True)
        events.append(step_failed("intent_classifier", f"Failed to classify intent: {error}", "PARSE_ERROR"))

    events.append(step_done("intent_classifier", f"Detected intent: {intent}"))
    log.done(intent=intent, modality=modality)
    return {"intent": intent, "query_modality": modality, "events": events}

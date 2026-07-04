import json
import logging
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from src.config import settings
from src.graph.state import AgentState

logger = logging.getLogger(__name__)


async def intent_classifier_node(state: AgentState, config: RunnableConfig) -> dict:
    correlation_id = config["configurable"].get("correlation_id", "")
    user_message = state["user_message"]

    logger.info(f"[{correlation_id}] intent_classifier_node: classifying intent for message: {user_message[:80]}")

    step_start_evt = {
        "type": "step_start",
        "step": "intent_classifier",
        "label": "Understanding your question..."
    }

    llm = ChatOpenAI(
        model="meta/llama-3.3-70b-instruct",
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key,
        timeout=30
    )

    system_prompt = (
        'You are an intent classifier. Analyze the user message and return a JSON object with these fields:\n'
        '- "intent": one of "search", "summarize", "analyze", "generate", "converse"\n'
        '- "file_types": an array of relevant file types, e.g. ["video", "image", "pdf"]\n'
        '- "query_modality": one of "visual", "thematic", "character", "both"\n'
        '- "character_name": the character name/label being asked about, or null\n\n'
        'Intent definitions:\n'
        '- "summarize": full video overview, all scenes, what happens in video, story breakdown\n'
        '- "search": find specific content across files\n'
        '- "converse": general chat, greetings, follow-ups\n'
        '- "analyze": deep analysis or comparison\n'
        '- "generate": create something new\n\n'
        'query_modality definitions:\n'
        '- "visual": user asks about appearance, what things look like, visual attributes\n'
        '  Examples: "show red dress scene", "what does the setting look like", "find clips with fire"\n'
        '- "thematic": user asks about story, meaning, themes, events, plot, what happened\n'
        '  Examples: "what is this video about", "what themes", "what happens in act 2", "summarize the story"\n'
        '- "character": user asks about a specific person by name or role\n'
        '  Examples: "who is Marie", "what does John do", "scenes with the protagonist"\n'
        '- "both": default when the query combines visual and thematic, or is ambiguous\n\n'
        'Return ONLY valid JSON, no other text.'
    )

    messages_for_llm = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message)
    ]

    intent = "search"
    file_types = ["video"]
    query_modality = "both"
    character_name = None

    try:
        response = await llm.ainvoke(messages_for_llm)
        raw = response.content.strip()
        parsed = json.loads(raw)
        intent = parsed.get("intent", "search")
        file_types = parsed.get("file_types", ["video"])
        query_modality = parsed.get("query_modality", "both")
        character_name = parsed.get("character_name")
    except Exception as e:
        logger.warning(f"[{correlation_id}] intent_classifier_node: JSON parse failed ({e}), defaulting to search/video")
        intent = "search"
        file_types = ["video"]
        query_modality = "both"
        character_name = None

    step_done_evt = {
        "type": "step_done",
        "step": "intent_classifier",
        "label": f"Detected intent: {intent}"
    }

    logger.info(
        f"[{correlation_id}] intent_classifier_node: intent={intent}, "
        f"modality={query_modality}, character={character_name}, file_types={file_types}"
    )

    return {
        "intent": intent,
        "file_types": file_types,
        "query_modality": query_modality,
        "character_name": character_name,
        "sse_events": [step_start_evt, step_done_evt]
    }

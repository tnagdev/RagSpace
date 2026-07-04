from typing import Annotated, Optional
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    user_message: str
    conversation_id: str
    user_id: str
    file_ids: Optional[list[str]]
    conversation_history: list[dict]
    conversation_summary: Optional[str]
    intent: Optional[str]
    file_types: Optional[list[str]]
    query_modality: Optional[str]
    character_name: Optional[str]
    search_results: Optional[list[dict]]
    tool_outputs: Optional[list[dict]]
    retrieved_context: Optional[str]
    messages: Annotated[list[BaseMessage], add_messages]
    final_response: Optional[str]
    attached_files: Optional[list[dict]]
    tools_used: list[str]
    sse_events: list[dict]

from typing import Optional

from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from typing_extensions import TypedDict


class AgentState(TypedDict):
    user_message: str
    user_id: str
    file_ids: list[str]
    conversation_history: list[dict]
    conversation_summary: Optional[str]
    attached_files: list[files_pb2.File]
    intent: Optional[str]
    query_modality: Optional[str]
    search_results: list[common_pb2.SearchHit]
    retrieved_context: Optional[str]
    final_response: Optional[str]
    tools_used: list[str]
    # Progress events emitted by the node that produced this update; see chat_runner for the wire format.
    events: list[dict]

"""Pydantic models for chat functionality"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    """Search result from file-embedder"""
    file_id: str
    scene_id: Optional[str] = None
    file_name: str
    file_type: Optional[str] = None
    score: float
    timestamp: Optional[float] = None
    thumbnail_s3_key: Optional[str] = None
    thumbnail_s3_bucket: Optional[str] = None
    file_s3_key: Optional[str] = None
    file_s3_bucket: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_url: Optional[str] = None
    youtube_url: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    text_content: Optional[str] = None
    # Metadata fields from LLM-generated descriptions
    description: Optional[str] = None
    objects: Optional[List[str]] = None
    setting: Optional[str] = None
    style: Optional[str] = None
    colors: Optional[List[str]] = None


class ToolCall(BaseModel):
    """Represents a tool call made by the agent"""
    name: str = Field(..., description="Name of the tool called")
    arguments: dict = Field(default_factory=dict, description="Arguments passed to the tool")
    result: Optional[dict] = Field(None, description="Result from tool execution")


class ChatMessage(BaseModel):
    """Single message in a conversation"""
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    searchResults: Optional[List[SearchResult]] = Field(None, description="Search results for this message")
    fileIds: Optional[List[str]] = Field(None, description="File IDs used for this message")
    toolCalls: Optional[List[ToolCall]] = Field(None, description="Tools called for this response")


class ChatRequest(BaseModel):
    """Request for chat endpoint"""
    message: str = Field(..., description="User's chat message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for context")
    file_ids: Optional[List[str]] = Field(None, description="Filter to specific files")
    max_results: int = Field(5, ge=1, le=20, description="Maximum search results")
    include_context: bool = Field(True, description="Include conversation context")
    use_agent: bool = Field(True, description="Use agentic mode with tool calling")


class ChatResponse(BaseModel):
    """Response from chat endpoint"""
    conversation_id: str
    message: str = Field(..., description="Assistant's response")
    results: List[SearchResult] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    context_used: bool = Field(False, description="Whether conversation context was used")
    tools_used: List[str] = Field(default_factory=list, description="Tools used in this response")


class Conversation(BaseModel):
    """Full conversation with history"""
    id: str
    user_id: str
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime
    title: Optional[str] = None
    summary: Optional[str] = Field(None, description="Summary of earlier conversation")


class ConversationSummary(BaseModel):
    """Summary of a conversation"""
    id: str
    title: Optional[str]
    last_message: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class AgentEvent(BaseModel):
    """SSE event from agent execution"""
    type: str = Field(..., description="Event type: tool_start, tool_result, content, done, error")
    tool: Optional[str] = Field(None, description="Tool name for tool events")
    arguments: Optional[str] = Field(None, description="Tool arguments JSON")
    results: Optional[List[dict]] = Field(None, description="Search results")
    result_count: Optional[int] = Field(None, description="Number of results")
    content: Optional[str] = Field(None, description="Content chunk for streaming")
    search_results: Optional[List[dict]] = Field(None, description="All search results")
    tools_used: Optional[List[str]] = Field(None, description="All tools used")
    error: Optional[str] = Field(None, description="Error message")

"""Pydantic models for chat functionality"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    """Search result from file-embedder"""
    file_id: str
    scene_id: Optional[str] = None
    file_name: str
    score: float
    timestamp: Optional[float] = None
    thumbnail_s3_key: Optional[str] = None
    thumbnail_s3_bucket: Optional[str] = None
    file_s3_key: Optional[str] = None
    file_s3_bucket: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_url: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    text_content: Optional[str] = None


class ChatMessage(BaseModel):
    """Single message in a conversation"""
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    searchResults: Optional[List[SearchResult]] = Field(None, description="Search results for this message")
    fileIds: Optional[List[str]] = Field(None, description="File IDs used for this message")


class ChatRequest(BaseModel):
    """Request for chat endpoint"""
    message: str = Field(..., description="User's chat message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for context")
    file_ids: Optional[List[str]] = Field(None, description="Filter to specific files")
    max_results: int = Field(5, ge=1, le=20, description="Maximum search results")
    include_context: bool = Field(True, description="Include conversation context")


class ChatResponse(BaseModel):
    """Response from chat endpoint"""
    conversation_id: str
    message: str = Field(..., description="Assistant's response")
    results: List[SearchResult] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    context_used: bool = Field(False, description="Whether conversation context was used")


class Conversation(BaseModel):
    """Full conversation with history"""
    id: str
    user_id: str
    messages: List[ChatMessage]
    created_at: datetime
    updated_at: datetime
    title: Optional[str] = None


class ConversationSummary(BaseModel):
    """Summary of a conversation"""
    id: str
    title: Optional[str]
    last_message: str
    message_count: int
    created_at: datetime
    updated_at: datetime

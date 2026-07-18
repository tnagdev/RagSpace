"""Configuration management for the chat-manager service."""
import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Service Configuration
    service_name: str = "chat-manager"
    port: int = 8080
    log_level: str = "INFO"
    mode: str = "production"
    
    # Database
    database_url: str
    
    # LLM Configuration (NVIDIA API)
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct"  # Vision model for multi-modal
    max_tokens: int = 1024
    temperature: float = 0.7
    
    # Agent Configuration
    agent_model: str = "nvidia/nemotron-3-ultra-550b-a55b"  # Tool-calling model for agent
    max_agent_iterations: int = 5  # Max tool calling loops
    enable_agentic_mode: bool = True  # Disabled by default - use direct search mode
    
    # Summarization Configuration
    summary_model: str = "nvidia/nemotron-3-ultra-550b-a55b"  # Model for summarization
    summary_threshold: int = 20  # Summarize when messages exceed this
    keep_recent_messages: int = 10  # Keep this many recent messages in full
    summary_max_tokens: int = 500  # Max tokens for summary generation
    
    # Context Window Management
    max_context_tokens: int = 4000  # Reserve space for response
    max_messages_in_context: int = 20  # Maximum messages to keep in context
    
    # External Service URLs
    file_embedder_url: str
    upload_manager_url: str
    scene_detector_url: str
    payment_service_url: str = "http://localhost:3006"
    
    # S3 Configuration
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = "ap-south-1"
    aws_s3_bucket: str = "user-uploads"
    s3_endpoint_url: Optional[str] = None
    s3_public_endpoint_url: Optional[str] = None  # Public-facing URL for pre-signed URLs (browser-accessible)
    s3_url_expiration: int = 3600
    
    # Node timeouts (seconds) — override via environment variables if needed
    intent_classifier_timeout: int = 60
    response_synthesizer_timeout: int = 120
    video_search_timeout: float = 30.0
    video_content_timeout: float = 60.0
    scene_thumbnail_timeout: float = 20.0
    file_content_timeout: float = 60.0

    # video_search_node over-fetches candidates (15-25) so adaptive scoring has
    # enough to rank; only the top-scoring subset should reach the LLM context
    # and UI. Kept separate from the retrieval breadth above.
    video_search_display_limit: int = 8

    # Conversation Settings
    max_conversation_history: int = 10
    context_window_size: int = 5
    
    class Config:
        env_file = ".env.development" if os.getenv("MODE") == "development" else ".env"
        case_sensitive = False


settings = Settings()

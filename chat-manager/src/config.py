"""Configuration management for the chat-manager service."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Service Configuration
    service_name: str = "chat-manager"
    service_port: int = 3005
    log_level: str = "INFO"
    mode: str = "production"
    
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/chat_manager"
    direct_url: Optional[str] = None  # Direct connection URL for Prisma migrations
    
    # LLM Configuration (NVIDIA API)
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct" #"meta/llama-3.3-70b-instruct"  # Meta's latest Llama model
    max_tokens: int = 1024
    temperature: float = 0.7
    
    # Context Window Management
    max_context_tokens: int = 4000  # Reserve space for response
    max_messages_in_context: int = 20  # Maximum messages to keep in context
    
    # External Service URLs
    file_embedder_url: str = "http://localhost:8003"
    upload_manager_url: str = "http://localhost:3002"
    scene_detector_url: str = "http://localhost:3003"
    
    # S3 Configuration
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = "us-east-1"
    s3_file_bucket_name: str = "user-uploads"
    s3_thumbnail_bucket_name: str = "thumbnails"
    s3_endpoint_url: Optional[str] = None
    s3_url_expiration: int = 3600
    
    # Conversation Settings
    max_conversation_history: int = 10
    context_window_size: int = 5
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

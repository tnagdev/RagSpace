"""Configuration management for the file-embedder service."""
import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # RabbitMQ Configuration
    rabbitmq_url: str
    rabbitmq_exchange: str = "file.events"
    rabbitmq_queue: str = "file.embedder.queue"
    temp_dir: str = "/tmp/file-embedder"
    
    # ChromaDB Configuration
    chroma_host: str
    chroma_port: int

    # Tesseract Configuration
    tesseract_cmd: Optional[str] = None
    
    # S3 Configuration
    aws_region: str
    aws_s3_endpoint: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_s3_bucket: str
    
    # Service Configuration
    service_name: str = "file-embedder"
    port: int
    log_level: str = "INFO"
    
    # External Service URLs
    upload_manager_url: str
    scene_detector_url: str
    chat_manager_url: str
    
    # Model Configuration
    device: str = "cpu"
    clip_model: str = "ViT-B-32"
    text_model: str = "BAAI/bge-base-en-v1.5"
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct"
    llm_max_concurrent_requests: int = 5
    max_concurrent_scenes: int = 3
    cpu_workers: int = 2
    message_handler_timeout: int = 3600
    mode: str = "production"
    
    # YouTube Downloader Configuration
    youtube_cookie_browser: Optional[str] = None  # Browser to extract cookies from: chrome, firefox, edge, safari
                                                   # Set to None to disable (recommended for Docker)

    class Config:
        env_file = ".env.development" if os.getenv("MODE") == "development" else ".env"
        case_sensitive = False
        env_file_encoding = 'utf-8'


settings = Settings()

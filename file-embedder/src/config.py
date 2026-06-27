"""Configuration management for the file-embedder service."""
import os
from pydantic_settings import BaseSettings
from typing import Optional

_CPU_COUNT = os.cpu_count() or 4


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
    whisper_model: str = "base"
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct"
    llm_max_concurrent_requests: int = 5
    max_concurrent_scenes: int = 3
    cpu_workers: int = max(2, _CPU_COUNT)
    message_handler_timeout: int = 30  # handlers launch a background task and return immediately
    mode: str = "production"
    
    # Batch / timeout tunables
    audio_segment_batch_size: int = 5
    chroma_upsert_batch_size: int = 100
    chroma_timeout_seconds: int = 30
    s3_download_timeout_seconds: float = 300.0
    chat_manager_timeout_seconds: float = 30.0
    llm_request_timeout: float = 60.0   # per-request timeout for vision LLM (NVIDIA API)
    llm_max_retries: int = 3
    llm_json_retry_count: int = 1

    # YouTube Downloader Configuration
    youtube_cookies_file: Optional[str] = None  # Path to Netscape-format cookies file
    youtube_format_selector: str = (
        'worst[ext=mp4][height<=480]'
        '/worst[ext=mp4]'
        '/worst[ext=webm][height<=480]'
        '/worst[ext=webm]'
        '/worst[height<=480]'
        '/worst'
        '/best[height<=480]'
        '/best'
    )
    max_processing_retries: int = 1  # set to >1 via MAX_PROCESSING_RETRIES env var to enable auto-retry
    max_scene_retries: int = 2                  # retries per individual scene before skipping
    scene_failure_threshold_ratio: float = 0.5  # abort when >50% of scenes fail after retries
    scene_failure_threshold_count: int = 5      # or when this many scenes fail (whichever fires first)

    class Config:
        env_file = ".env.development" if os.getenv("MODE") == "development" else ".env"
        case_sensitive = False
        env_file_encoding = 'utf-8'


settings = Settings()

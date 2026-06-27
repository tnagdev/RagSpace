import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from src.models.enums import EventType


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    port: int = 8080
    mode: str = "production"

    # Services
    upload_manager_url: str = "http://localhost:3002"

    # Database
    database_url: str
    
    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    rabbitmq_exchange: str = "file.events"
    rabbitmq_queue: str = "scene.detector.queue"
    rabbitmq_user_queue: str = "user.events.queue"
    rabbitmq_user_exchange: str = "user.events"
    rabbitmq_user_routing_key: str = "user.events.*"
    rabbitmq_routing_key: str = EventType.UPLOAD_COMPLETED.value
    
    # AWS S3
    aws_region: str = "ap-south-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_s3_bucket: str = "user-uploads"
    aws_s3_endpoint: Optional[str] = None
    
    # YouTube Download
    youtube_cookies_file: Optional[str] = None  # Path to Netscape-format cookies.txt
    # Progressive fallback: prefer small MP4, fall back to WebM, then anything
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

    # Scene Detection
    scene_detection_threshold: float = 27.0
    scene_detection_min_scene_length: int = 15
    thumbnail_width: int = 256
    thumbnail_height: int = 256
    thumbnail_quality: int = 70
    
    # Processing
    temp_dir: str = "/tmp/scene-detector"
    # Dynamic: max(2, min(cpu_count // 2, 6)) - defaults to 2 if env override not set
    max_concurrent_jobs: int = max(2, min((os.cpu_count() or 4) // 2, 6))
    max_processing_retries: int = 1  # set to >1 via MAX_PROCESSING_RETRIES env var to enable auto-retry
    message_handler_timeout: int = 30  # seconds; handler just launches a background task, should complete quickly
    
    model_config = SettingsConfigDict(
        env_file=".env.development" if os.getenv("MODE") == "development" else ".env",
        case_sensitive=False,
        env_file_encoding='utf-8',
    )


settings = Settings()

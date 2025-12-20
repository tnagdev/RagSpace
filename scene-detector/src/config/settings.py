from pydantic_settings import BaseSettings
from typing import Optional

from src.common.enums import EventType


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Application
    port: int = 3003
    mode: str = "development"

    # Services
    upload_manager_url: str = "http://localhost:3002"

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/file_embedder"
    direct_url: Optional[str] = None  # Direct connection URL for Prisma migrations
    
    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    rabbitmq_exchange: str = "file.events"
    rabbitmq_queue: str = "scene.detector.queue"
    rabbitmq_routing_key: str = EventType.UPLOAD_COMPLETED.value
    
    # AWS S3
    aws_region: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_s3_bucket: Optional[str] = None
    aws_s3_endpoint: Optional[str] = None  # For MinIO or custom S3
    
    # Scene Detection
    scene_detection_threshold: float = 27.0  # Default threshold for scene detection
    scene_detection_min_scene_length: int = 15  # Minimum scene length in frames
    thumbnail_width: int = 256
    thumbnail_height: int = 256
    thumbnail_quality: int = 70
    
    # Processing
    temp_dir: str = "/tmp/file-embedder"
    max_concurrent_jobs: int = 2
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

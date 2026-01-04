"""Configuration management for the file-embedder service."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # RabbitMQ Configuration
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    rabbitmq_exchange: str = "file.events"
    rabbitmq_queue: str = "file.embedder.queue"
    temp_dir: str = "/tmp/file-embedder"
    
    # ChromaDB Configuration
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    chroma_db_path: str = "./chroma_data"

    # Tesseract Configuration
    tesseract_cmd: Optional[str] = None
    
    # S3 Configuration
    aws_region: str = "ap-south-1"
    aws_s3_endpoint: str = "http://localhost:9000"
    aws_access_key_id: str = "minioadmin"
    aws_secret_access_key: str = "minioadmin"
    aws_s3_bucket: str = "videos"
    
    # Service Configuration
    service_name: str = "file-embedder"
    service_port: int = 8003
    log_level: str = "INFO"
    
    # External Service URLs
    upload_manager_url: str = "http://localhost:3002"
    scene_detector_url: str = "http://localhost:3003"
    
    # Model Configuration
    device: str = "cpu"
    clip_model: str = "ViT-B-32"
    text_model: str = "BAAI/bge-base-en-v1.5"
    
    # LLM Configuration (NVIDIA API)
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct"
    
    mode: str = "production"
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

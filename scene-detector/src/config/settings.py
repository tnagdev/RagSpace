import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8080
    grpc_port: int = 50051
    mode: str = "production"

    database_url: str
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    files_grpc_address: str = "upload-manager:50051"

    aws_region: str = "ap-south-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_s3_bucket: str = "user-uploads"
    aws_s3_endpoint: Optional[str] = None
    # Presigned URLs must use a browser-reachable host (localhost:9000, not minio:9000).
    aws_s3_public_endpoint: Optional[str] = None

    youtube_cookies_file: Optional[str] = None
    # Smallest stream that still gives usable keyframes; falls back progressively.
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

    scene_detection_threshold: float = 27.0
    scene_detection_min_scene_length: int = 15
    thumbnail_width: int = 256
    thumbnail_height: int = 256
    thumbnail_quality: int = 70

    temp_dir: str = "/tmp/scene-detector"
    max_concurrent_jobs: int = max(2, min((os.cpu_count() or 4) // 2, 6))
    max_processing_retries: int = 1

    model_config = SettingsConfigDict(
        env_file=".env.development" if os.getenv("MODE") == "development" else ".env",
        case_sensitive=False,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

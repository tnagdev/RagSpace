import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

_CPU_COUNT = os.cpu_count() or 4


class Settings(BaseSettings):
    port: int = 8080
    grpc_port: int = 50051

    rabbitmq_url: str
    files_grpc_address: str = "upload-manager:50051"
    scenes_grpc_address: str = "scene-detector-server:50051"
    temp_dir: str = "/tmp/file-embedder"

    chroma_host: str
    chroma_port: int
    chroma_upsert_batch_size: int = 100

    tesseract_cmd: Optional[str] = None

    aws_region: str
    aws_s3_endpoint: Optional[str] = None
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_s3_bucket: str
    s3_download_timeout_seconds: float = 300.0

    device: str = "cpu"
    clip_model: str = "ViT-B-32"
    text_model: str = "BAAI/bge-base-en-v1.5"
    whisper_model: str = "base"
    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "meta/llama-3.2-11b-vision-instruct"
    llm_max_concurrent_requests: int = 5
    llm_request_timeout: float = 60.0
    llm_max_retries: int = 3
    llm_json_retry_count: int = 1

    cpu_workers: int = max(2, _CPU_COUNT)
    max_concurrent_jobs: int = max(2, min(_CPU_COUNT // 2, 6))
    max_concurrent_scenes: int = 3
    audio_segment_batch_size: int = 5

    youtube_cookies_file: Optional[str] = None
    # Smallest stream that still has a usable audio track; falls back progressively.
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

    max_processing_retries: int = 1
    max_scene_retries: int = 2
    # Abort scene indexing when either threshold is crossed after per-scene retries.
    scene_failure_threshold_ratio: float = 0.5
    scene_failure_threshold_count: int = 5
    # How long scene indexing waits for this file's transcription before indexing without it.
    transcription_wait_seconds: float = 1800.0

    model_config = SettingsConfigDict(
        env_file=".env.development" if os.getenv("MODE") == "development" else ".env",
        case_sensitive=False,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

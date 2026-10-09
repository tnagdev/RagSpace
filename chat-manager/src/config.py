import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    port: int = 8080
    grpc_port: int = 50051

    database_url: str
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    search_grpc_address: str = "file-embedder-server:50051"
    files_grpc_address: str = "upload-manager:50051"
    scenes_grpc_address: str = "scene-detector-server:50051"
    billing_grpc_address: str = "payment-service:50051"

    nvidia_api_key: Optional[str] = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    agent_model: str = "nvidia/nemotron-3-ultra-550b-a55b"
    greeting_model: str = "meta/llama-3.2-11b-vision-instruct"
    summary_model: str = "nvidia/nemotron-3-ultra-550b-a55b"

    # Summarize once the unsummarized history exceeds the threshold, keeping the most recent messages verbatim.
    summary_threshold: int = 20
    keep_recent_messages: int = 10
    summary_max_tokens: int = 500
    max_message_chars: int = 8000

    intent_classifier_timeout: int = 60
    response_synthesizer_timeout: int = 120
    video_search_timeout: float = 30.0
    video_content_timeout: float = 60.0
    scene_thumbnail_timeout: float = 20.0
    file_content_timeout: float = 60.0
    greeting_timeout: float = 20.0
    # Search over-fetches so the ranker has candidates; only this many reach the prompt and UI.
    video_search_display_limit: int = 8

    model_config = SettingsConfigDict(
        env_file=".env.development" if os.getenv("MODE") == "development" else ".env",
        case_sensitive=False,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

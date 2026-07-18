"""
Shared pytest configuration and fixtures for the file-embedder test suite.

IMPORTANT: env vars must be set BEFORE any src.* import to satisfy
`settings = Settings()` which runs at module import time.
"""

import os
import sys

# ---------------------------------------------------------------------------
# 1. Set required env vars at module level, before any src.* import
# ---------------------------------------------------------------------------
_REQUIRED_ENV = {
    "RABBITMQ_URL": "amqp://guest:guest@localhost:5672/",
    "CHROMA_HOST": "localhost",
    "CHROMA_PORT": "8007",
    "AWS_REGION": "us-east-1",
    "AWS_S3_ENDPOINT": "http://localhost:9000",
    "AWS_ACCESS_KEY_ID": "minioadmin",
    "AWS_SECRET_ACCESS_KEY": "minioadmin",
    "AWS_S3_BUCKET": "test-bucket",
    "UPLOAD_MANAGER_URL": "http://localhost:8002",
    "SCENE_DETECTOR_URL": "http://localhost:8003",
    "CHAT_MANAGER_URL": "http://localhost:8005",
    "PORT": "8004",
}
for k, v in _REQUIRED_ENV.items():
    os.environ.setdefault(k, v)

# ---------------------------------------------------------------------------
# 2. Patch heavy ML / infra libs before ANY src import so they never load
# ---------------------------------------------------------------------------
from unittest.mock import MagicMock, AsyncMock, patch  # noqa: E402

# Mock chromadb before it's imported
chromadb_mod = MagicMock()
chromadb_mod.HttpClient = MagicMock
chromadb_mod.Settings = MagicMock
sys.modules.setdefault("chromadb", chromadb_mod)
sys.modules.setdefault("chromadb.config", MagicMock())

# Mock aio_pika
aio_pika_mod = MagicMock()
sys.modules.setdefault("aio_pika", aio_pika_mod)
sys.modules.setdefault("aio_pika.abc", MagicMock())

# Mock sentence_transformers
sys.modules.setdefault("sentence_transformers", MagicMock())

# Mock whisper / openai_whisper
sys.modules.setdefault("whisper", MagicMock())

# Mock open_clip and its submodules
open_clip_mock = MagicMock()
sys.modules.setdefault("open_clip", open_clip_mock)

# Mock torch and torch-related
torch_mock = MagicMock()
sys.modules.setdefault("torch", torch_mock)
sys.modules.setdefault("torchvision", MagicMock())
sys.modules.setdefault("torchaudio", MagicMock())

# Mock transformers
sys.modules.setdefault("transformers", MagicMock())

# Mock pytesseract
pytesseract_mock = MagicMock()
sys.modules.setdefault("pytesseract", pytesseract_mock)

# Mock boto3
boto3_mock = MagicMock()
sys.modules.setdefault("boto3", boto3_mock)
sys.modules.setdefault("botocore", MagicMock())
sys.modules.setdefault("botocore.config", MagicMock())
sys.modules.setdefault("botocore.exceptions", MagicMock())

# Mock cv2
sys.modules.setdefault("cv2", MagicMock())

# Mock PIL
pil_mock = MagicMock()
sys.modules.setdefault("PIL", pil_mock)
sys.modules.setdefault("PIL.Image", MagicMock())

# Mock ffmpeg
sys.modules.setdefault("ffmpeg", MagicMock())

# Mock spacy
spacy_mock = MagicMock()
sys.modules.setdefault("spacy", spacy_mock)

# Mock yt_dlp
sys.modules.setdefault("yt_dlp", MagicMock())

# Mock openai
openai_mock = MagicMock()
sys.modules.setdefault("openai", openai_mock)
sys.modules.setdefault("openai.types", MagicMock())

# Mock numpy scalar types but keep numpy usable (tests use np.float32, etc.)
import numpy as np  # noqa: E402  — numpy itself is real

import pytest  # noqa: E402

# ---------------------------------------------------------------------------
# 3. Now we can safely import the singleton
# ---------------------------------------------------------------------------
from src.decorators.singleton import SingletonMeta  # noqa: E402


# ---------------------------------------------------------------------------
# 4. Autouse fixture: clear SingletonMeta instances around every test
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def clear_singleton_instances():
    """Clear all singleton instances before and after each test."""
    SingletonMeta._instances.clear()
    yield
    SingletonMeta._instances.clear()


# ---------------------------------------------------------------------------
# 5. Shared collection / db fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_chroma_collection():
    """Return a fresh MagicMock that behaves like a ChromaDB collection."""
    col = MagicMock()
    col.count.return_value = 0
    col.upsert = MagicMock()
    col.query.return_value = {
        "ids": [[]],
        "metadatas": [[]],
        "distances": [[]],
        "documents": [[]],
    }
    col.get.return_value = {"ids": [], "metadatas": [], "documents": []}
    col.delete = MagicMock()
    return col


@pytest.fixture
def mock_chroma_db(mock_chroma_collection):
    """
    Return a ChromaDatabaseManager instance with both collections mocked.

    Two separate collection mocks are used so tests can distinguish between
    text_collection and image_collection calls.
    """
    from src.db.chroma_db import ChromaDatabaseManager

    text_col = MagicMock()
    text_col.count.return_value = 0
    text_col.upsert = MagicMock()
    text_col.query.return_value = {
        "ids": [[]],
        "metadatas": [[]],
        "distances": [[]],
        "documents": [[]],
    }
    text_col.get.return_value = {"ids": [], "metadatas": [], "documents": []}
    text_col.delete = MagicMock()

    image_col = MagicMock()
    image_col.count.return_value = 0
    image_col.upsert = MagicMock()
    image_col.query.return_value = {
        "ids": [[]],
        "metadatas": [[]],
        "distances": [[]],
        "documents": [[]],
    }
    image_col.get.return_value = {"ids": [], "metadatas": [], "documents": []}
    image_col.delete = MagicMock()

    with patch("chromadb.HttpClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.get_or_create_collection.side_effect = [text_col, image_col]
        mock_client_cls.return_value = mock_client

        db = ChromaDatabaseManager()
        # Ensure the collections are the ones we control
        db.text_collection = text_col
        db.image_collection = image_col

    return db, text_col, image_col


# ---------------------------------------------------------------------------
# 6. Event factory fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def make_upload_event():
    """Factory for UploadCompletedEventModel instances."""
    from src.models.events import UploadCompletedEventModel, UploadEventFileMetadata, AuthUser
    from src.models.enums import FileType

    def _make(
        file_id="file-123",
        file_type=FileType.VIDEO,
        s3_key="videos/file-123.mp4",
        s3_url="http://localhost:9000/test-bucket/videos/file-123.mp4",
        file_name="test_video.mp4",
        youtube_url=None,
        user_id="user-abc",
        user_email="test@example.com",
    ):
        return UploadCompletedEventModel(
            fileId=file_id,
            timestamp="2024-01-01T00:00:00",
            user=AuthUser(id=user_id, email=user_email),
            data=UploadEventFileMetadata(
                s3Key=s3_key,
                s3Url=s3_url,
                fileType=file_type,
                fileName=file_name,
                youtubeUrl=youtube_url,
            ),
        )

    return _make


@pytest.fixture
def make_processing_event():
    """Factory for ProcessingCompletedEventModel instances."""
    from src.models.events import (
        ProcessingCompletedEventModel,
        ProcessingEventSceneMetadata,
        ProcessingEventFileMetadata,
        AuthUser,
    )
    from src.models.enums import FileType

    def _make(
        file_id="file-123",
        file_name="test_video.mp4",
        file_type=FileType.VIDEO,
        scenes=None,
        user_id="user-abc",
        user_email="test@example.com",
    ):
        if scenes is None:
            scenes = [
                ProcessingEventFileMetadata(
                    id=f"scene-{i}",
                    sceneNumber=i,
                    startTime=float(i * 5),
                    endTime=float(i * 5 + 5),
                    startFrame=i * 150,
                    endFrame=(i + 1) * 150,
                    keyframe=i * 150 + 75,
                    thumbnailUrl=f"http://localhost:9000/test-bucket/thumbnails/scene_{i}.jpg",
                    thumbnailS3Key=f"thumbnails/scene_{i}.jpg",
                )
                for i in range(3)
            ]
        return ProcessingCompletedEventModel(
            fileId=file_id,
            fileName=file_name,
            fileType=file_type,
            timestamp="2024-01-01T00:00:00",
            user=AuthUser(id=user_id, email=user_email),
            data=ProcessingEventSceneMetadata(
                scenes=scenes,
                scenes_detected=len(scenes),
            ),
        )

    return _make


@pytest.fixture
def make_deleted_event():
    """Factory for FileDeletedEventModel instances."""
    from src.models.events import FileDeletedEventModel, FileDeletedEventData, AuthUser
    from src.models.enums import FileType

    def _make(
        file_id=None,
        file_ids=None,
        file_type=FileType.VIDEO,
        file_name="test_video.mp4",
        user_id="user-abc",
        user_email="test@example.com",
    ):
        return FileDeletedEventModel(
            fileId=file_id,
            fileIds=file_ids,
            timestamp="2024-01-01T00:00:00",
            user=AuthUser(id=user_id, email=user_email),
            data=FileDeletedEventData(fileType=file_type, fileName=file_name),
        )

    return _make

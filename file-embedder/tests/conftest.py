import os
import sys
from unittest.mock import MagicMock

# Settings() is evaluated at import time, so these must exist before any src.* import.
for key, value in {
    "RABBITMQ_URL": "amqp://guest:guest@localhost:5672/",
    "CHROMA_HOST": "localhost",
    "CHROMA_PORT": "8007",
    "AWS_REGION": "us-east-1",
    "AWS_S3_ENDPOINT": "http://localhost:9000",
    "AWS_ACCESS_KEY_ID": "minioadmin",
    "AWS_SECRET_ACCESS_KEY": "minioadmin",
    "AWS_S3_BUCKET": "test-bucket",
    "PORT": "8004",
    "NVIDIA_API_KEY": "",
}.items():
    os.environ.setdefault(key, value)

# Keep model and vector-store libraries from loading during unit tests.
for module in (
    "chromadb",
    "chromadb.config",
    "sentence_transformers",
    "faster_whisper",
    "open_clip",
    "torch",
    "torchvision",
    "transformers",
    "pytesseract",
    "cv2",
    "ffmpeg",
    "spacy",
    "yt_dlp",
):
    sys.modules.setdefault(module, MagicMock())

import pytest  # noqa: E402

from src.decorators.singleton import SingletonMeta  # noqa: E402


@pytest.fixture(autouse=True)
def clear_singletons():
    SingletonMeta._instances.clear()
    yield
    SingletonMeta._instances.clear()


def make_collection() -> MagicMock:
    collection = MagicMock()
    collection.query.return_value = {"ids": [[]], "metadatas": [[]], "distances": [[]], "documents": [[]]}
    collection.get.return_value = {"ids": [], "metadatas": [], "documents": []}
    return collection


@pytest.fixture
def chroma():
    from src.db.chroma_db import ChromaDatabaseManager

    db = ChromaDatabaseManager()
    db.text_collection = make_collection()
    db.image_collection = make_collection()
    return db

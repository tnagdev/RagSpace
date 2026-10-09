import os
from datetime import datetime, timezone
from types import SimpleNamespace

# Settings() is evaluated at import time, so these must exist before any src.* import.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ["NVIDIA_API_KEY"] = ""

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


def conversation(**overrides) -> SimpleNamespace:
    base = dict(
        id="conv-1",
        userId="user-1",
        title=None,
        summary=None,
        summarizedUntil=None,
        fileId=None,
        collectionId=None,
        requestId=None,
        messageCount=0,
        lastMessagePreview=None,
        createdAt=NOW,
        updatedAt=NOW,
    )
    return SimpleNamespace(**{**base, **overrides})


def message(**overrides) -> SimpleNamespace:
    base = dict(
        id="msg-1",
        conversationId="conv-1",
        role="user",
        content="hello",
        timestamp=NOW,
        searchResults=None,
        fileIds=[],
        toolsUsed=[],
        requestId=None,
        replyToId=None,
    )
    return SimpleNamespace(**{**base, **overrides})


def state(**overrides) -> dict:
    base = {
        "user_message": "find me cat videos",
        "user_id": "user-1",
        "file_ids": [],
        "conversation_history": [],
        "conversation_summary": None,
        "attached_files": [],
        "intent": None,
        "query_modality": None,
        "search_results": [],
        "retrieved_context": None,
        "final_response": None,
        "tools_used": [],
        "events": [],
    }
    return {**base, **overrides}

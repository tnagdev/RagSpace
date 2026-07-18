"""
TC-100 to TC-105: tests for embedding progress changes in file_upload_complete_handler.py

- _publish_embedding_progress publishes PROCESSING_PROGRESS with stage=EMBEDDING
- process_video publishes PROCESSING_STARTED with stage=EMBEDDING before the loop
- process_video emits 0% progress before processing any batch
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_transcription(n_segments):
    return {
        "text": " ".join(f"seg {i}" for i in range(n_segments)),
        "segments": [
            {"text": f"seg {i}", "start": float(i * 2), "end": float(i * 2 + 2)}
            for i in range(n_segments)
        ],
    }


def _make_fake_embedding(dim=768):
    return [0.1] * dim


# ── TC-100: _publish_embedding_progress publishes PROCESSING_PROGRESS ─────────

@pytest.mark.asyncio
async def test_publish_embedding_progress_event_type_and_stage():
    """TC-100: _publish_embedding_progress calls publish_event with
    type=PROCESSING_PROGRESS and data.stage=EMBEDDING."""
    from src.rabbitmq.handlers.file_upload_complete_handler import _publish_embedding_progress

    with patch(
        "src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
        new_callable=AsyncMock,
    ) as mock_pub:
        await _publish_embedding_progress("file-1", "u1", 3, 10)

        mock_pub.assert_awaited_once()
        event_type = mock_pub.await_args[0][0]
        payload = mock_pub.await_args[0][1]

        # routing key must be the progress event type
        assert event_type == "file.processing.progress"
        assert payload["data"]["stage"] == "EMBEDDING"
        assert payload["fileId"] == "file-1"
        assert payload["userId"] == "u1"


# ── TC-101: percentage calculation ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_embedding_progress_percentage_calculation():
    """TC-101: done=3, total=10 → progress=30."""
    from src.rabbitmq.handlers.file_upload_complete_handler import _publish_embedding_progress

    with patch(
        "src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
        new_callable=AsyncMock,
    ) as mock_pub:
        await _publish_embedding_progress("file-1", "u1", 3, 10)

        payload = mock_pub.await_args[0][1]
        assert payload["data"]["progress"] == 30


# ── TC-102: zero percent ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_embedding_progress_zero_percent():
    """TC-102: done=0, total=5 → progress=0."""
    from src.rabbitmq.handlers.file_upload_complete_handler import _publish_embedding_progress

    with patch(
        "src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
        new_callable=AsyncMock,
    ) as mock_pub:
        await _publish_embedding_progress("file-1", "u1", 0, 5)

        payload = mock_pub.await_args[0][1]
        assert payload["data"]["progress"] == 0


# ── TC-103: total=0 guard (no division by zero) ───────────────────────────────

@pytest.mark.asyncio
async def test_publish_embedding_progress_total_zero_returns_100():
    """TC-103: total=0 → progress=100 (fallback to avoid ZeroDivisionError)."""
    from src.rabbitmq.handlers.file_upload_complete_handler import _publish_embedding_progress

    with patch(
        "src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
        new_callable=AsyncMock,
    ) as mock_pub:
        await _publish_embedding_progress("file-1", "u1", 0, 0)

        payload = mock_pub.await_args[0][1]
        assert payload["data"]["progress"] == 100


# ── TC-104: exception swallowing ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_embedding_progress_swallows_exception():
    """TC-104: _publish_embedding_progress does NOT raise even if publish_event fails."""
    from src.rabbitmq.handlers.file_upload_complete_handler import _publish_embedding_progress

    with patch(
        "src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
        side_effect=Exception("RabbitMQ down"),
    ):
        # Must not raise
        await _publish_embedding_progress("file-1", "u1", 0, 10)


# ── TC-105: process_video publishes PROCESSING_STARTED with stage=EMBEDDING ───

@pytest.mark.asyncio
async def test_process_video_publishes_started_with_embedding_stage(make_upload_event):
    """TC-105: process_video emits PROCESSING_STARTED (stage=EMBEDDING) as its
    first publish_event call, before any download/embed work."""
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(file_type=FileType.VIDEO)

    published: list = []

    async def capture_publish(event_type, payload):
        published.append({"event_type": event_type, "payload": payload})
        # Raise after first publish to keep the test fast (we only need the first event)
        if len(published) == 1:
            raise Exception("cut-short")

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(side_effect=Exception("cut-short"))

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
               side_effect=capture_publish), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService",
               return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.cpu_executor",
               MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.settings",
               MagicMock(temp_dir="/tmp", whisper_model="tiny",
                         audio_segment_batch_size=10)), \
         patch("os.makedirs"), \
         patch("tempfile.mkdtemp", return_value="/tmp/test"):
        try:
            await process_video(event)
        except Exception:
            pass

    assert len(published) >= 1, "Expected at least one publish_event call"
    first = published[0]
    assert first["event_type"] == "file.processing.started"
    assert first["payload"]["data"]["stage"] == "EMBEDDING"
    assert first["payload"]["fileId"] == event.fileId
    assert first["payload"]["userId"] == event.user.id


# ── TC-106: process_video emits 0% progress before any segment is processed ───

@pytest.mark.asyncio
async def test_process_video_emits_zero_progress_before_batch_loop(make_upload_event):
    """TC-106: The first _publish_embedding_progress call uses done=0,
    preceding any batch-segment embedding call."""
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(file_type=FileType.VIDEO)

    progress_calls: list = []

    async def track_progress(file_id, user_id, done, total):
        progress_calls.append((done, total))

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock()

    mock_audio = MagicMock()
    mock_audio.transcribe_audio.return_value = _make_transcription(3)
    mock_audio.embed_text.return_value = _make_fake_embedding()

    mock_chroma = MagicMock()
    mock_chroma.upsert_items = MagicMock()
    mock_chroma.text_index_name = "text"

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.publish_event",
               new_callable=AsyncMock), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler._publish_embedding_progress",
               side_effect=track_progress), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService",
               return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService",
               return_value=mock_audio), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager",
               return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService",
               return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.extract_audio"), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.cpu_executor",
               MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.settings",
               MagicMock(temp_dir="/tmp", whisper_model="tiny",
                         audio_segment_batch_size=10)), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("os.makedirs"), \
         patch("os.path.join", side_effect=lambda *a: "/tmp/" + a[-1]), \
         patch("os.path.splitext", return_value=("video", ".mp4")), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"), \
         patch("tempfile.mkdtemp", return_value="/tmp/test"):

        loop_inst = MagicMock()

        async def fake_executor(executor, fn, *args):
            return fn(*args)

        loop_inst.run_in_executor = fake_executor
        mock_loop.return_value = loop_inst

        try:
            await process_video(event)
        except Exception:
            pass

    assert len(progress_calls) >= 1, "Expected at least one _publish_embedding_progress call"
    first_done, _total = progress_calls[0]
    assert first_done == 0, (
        f"First progress call should have done=0 (seed), got done={first_done}. "
        f"All calls: {progress_calls}"
    )

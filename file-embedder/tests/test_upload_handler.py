"""
TC-021 to TC-029: file_upload_complete_handler tests.
"""

import asyncio
import os
import shutil
import tempfile
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call


# ---------------------------------------------------------------------------
# Helpers – reusable mock wiring
# ---------------------------------------------------------------------------

def _make_fake_embedding(dim=768):
    return [0.1] * dim


def _make_transcription(n_segments):
    return {
        "text": " ".join(f"segment {i}" for i in range(n_segments)),
        "segments": [
            {"text": f"segment {i}", "start": float(i * 3), "end": float(i * 3 + 3)}
            for i in range(n_segments)
        ],
    }


# ---------------------------------------------------------------------------
# TC-021: process_video embeds each segment (7 segments → embed_text × 7)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_video_handler_segments_in_batches_of_5(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(file_type=FileType.VIDEO)

    mock_transcription = _make_transcription(7)
    fake_embedding = _make_fake_embedding()

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/file.mp4")

    mock_audio_embedder = MagicMock()
    mock_audio_embedder.transcribe_audio.return_value = mock_transcription
    mock_audio_embedder.embed_text.return_value = fake_embedding

    mock_chroma = MagicMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService", return_value=mock_audio_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.extract_audio"), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/fake_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        # Make loop.run_in_executor call the function directly (no thread pool)
        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_video(event)

    # embed_text must be called once per segment (7 total)
    assert mock_audio_embedder.embed_text.call_count == 7


# ---------------------------------------------------------------------------
# TC-022: segment_index in upserted items is absolute (0 through 6)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_video_handler_segment_index_is_absolute(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(file_type=FileType.VIDEO)

    mock_transcription = _make_transcription(7)
    fake_embedding = _make_fake_embedding()

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/file.mp4")

    mock_audio_embedder = MagicMock()
    mock_audio_embedder.transcribe_audio.return_value = mock_transcription
    mock_audio_embedder.embed_text.return_value = fake_embedding

    captured_items = []

    mock_chroma = MagicMock()

    def capture_upsert(index_name, items):
        captured_items.extend(items)

    mock_chroma.upsert_items.side_effect = capture_upsert
    mock_chroma.text_index_name = "text_embeddings"

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService", return_value=mock_audio_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.extract_audio"), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/fake_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_video(event)

    # Segment indices should be 0..6 (absolute, not restarting per batch)
    indices = [item["segment_index"] for item in captured_items]
    assert sorted(indices) == list(range(7)), f"Expected 0-6, got {indices}"

    # Also verify chunk_ids use absolute indices
    chunk_ids = [item["chunk_id"] for item in captured_items]
    for i in range(7):
        assert f"#audio#{i}" in " ".join(chunk_ids), f"Missing absolute index {i}"


# ---------------------------------------------------------------------------
# TC-023: shutil.rmtree called even when S3 download raises
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_video_handler_cleans_temp_dir_on_exception(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(file_type=FileType.VIDEO)

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(side_effect=RuntimeError("S3 error"))

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.extract_audio"), \
         patch("tempfile.mkdtemp", return_value="/tmp/fake_cleanup_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True) as mock_exists, \
         patch("shutil.rmtree") as mock_rmtree:

        await process_video(event)

    # shutil.rmtree must be called with the temp dir we created
    mock_rmtree.assert_called_once_with("/tmp/fake_cleanup_temp", ignore_errors=True)


# ---------------------------------------------------------------------------
# TC-024: YouTube video triggers YouTubeDownloaderService, not s3_client.download
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_youtube_video_skips_s3_download(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_video

    event = make_upload_event(
        file_type=FileType.YOUTUBE_VIDEO,
        youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock()

    mock_yt = MagicMock()
    mock_yt.download_video = AsyncMock(return_value={"title": "Test Video"})

    mock_audio_embedder = MagicMock()
    mock_audio_embedder.transcribe_audio.return_value = _make_transcription(2)
    mock_audio_embedder.embed_text.return_value = _make_fake_embedding()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService", return_value=mock_audio_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.YouTubeDownloaderService", return_value=mock_yt), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.extract_audio"), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/yt_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_video(event)

    mock_yt.download_video.assert_called_once()
    mock_s3.download.assert_not_called()


# ---------------------------------------------------------------------------
# TC-025: process_audio returns early when youtubeUrl is set
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_audio_handler_skips_youtube_url(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_audio

    event = make_upload_event(
        file_type=FileType.AUDIO,
        youtube_url="https://www.youtube.com/watch?v=abc123",
    )

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.AudioEmbedderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=MagicMock()), \
         patch("tempfile.mkdtemp", return_value="/tmp/audio_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        await process_audio(event)

    mock_s3.download.assert_not_called()


# ---------------------------------------------------------------------------
# TC-026: process_image upserts BOTH image and text collections on success
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_handler_upserts_both_collections(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_image

    event = make_upload_event(file_type=FileType.IMAGE, file_name="photo.jpg")

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/photo.jpg")

    mock_image_embedder = MagicMock()
    mock_image_embedder.embed_image.return_value = _make_fake_embedding(512)
    mock_image_embedder.extract_text.return_value = "some OCR text"
    mock_image_embedder.embed_text.return_value = _make_fake_embedding(768)
    mock_image_embedder.generate_image_description = AsyncMock(return_value=None)

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()
    mock_upload_manager.upsert_file_metadata = AsyncMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ImageEmbedderService", return_value=mock_image_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/img_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_image(event)

    assert mock_chroma.upsert_items.call_count == 2
    call_args_list = mock_chroma.upsert_items.call_args_list
    index_names = [c[0][0] for c in call_args_list]
    assert "image_embeddings" in index_names
    assert "text_embeddings" in index_names


# ---------------------------------------------------------------------------
# TC-027: process_image only upserts image collection when OCR returns empty text
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_handler_no_text_upsert_when_ocr_empty(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_image

    event = make_upload_event(file_type=FileType.IMAGE, file_name="blank.png")

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/blank.png")

    mock_image_embedder = MagicMock()
    mock_image_embedder.embed_image.return_value = _make_fake_embedding(512)
    mock_image_embedder.extract_text.return_value = ""   # empty OCR
    mock_image_embedder.embed_text.return_value = None
    mock_image_embedder.generate_image_description = AsyncMock(return_value=None)

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ImageEmbedderService", return_value=mock_image_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/blank_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_image(event)

    assert mock_chroma.upsert_items.call_count == 1
    call_index_name = mock_chroma.upsert_items.call_args[0][0]
    assert call_index_name == "image_embeddings"


# ---------------------------------------------------------------------------
# TC-028: process_image does NOT abort when LLM raises an exception
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_handler_llm_failure_does_not_abort(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_image

    event = make_upload_event(file_type=FileType.IMAGE, file_name="photo.jpg")

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/photo.jpg")

    mock_image_embedder = MagicMock()
    mock_image_embedder.embed_image.return_value = _make_fake_embedding(512)
    mock_image_embedder.extract_text.return_value = "some text"
    mock_image_embedder.embed_text.return_value = _make_fake_embedding(768)
    # LLM raises an exception
    mock_image_embedder.generate_image_description = AsyncMock(
        side_effect=RuntimeError("LLM unavailable")
    )

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ImageEmbedderService", return_value=mock_image_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/llm_err_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        # Should NOT raise
        await process_image(event)

    # Image must still be upserted despite LLM failure
    assert mock_chroma.upsert_items.call_count >= 1
    # Status update must still happen
    mock_upload_manager.update_file_status.assert_called_once()


# ---------------------------------------------------------------------------
# TC-029: process_image uses correct chunk_id format for image and text items
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_handler_chunk_ids(make_upload_event):
    from src.models.enums import FileType
    from src.rabbitmq.handlers.file_upload_complete_handler import process_image

    FILE_ID = "file-chunk-test"
    event = make_upload_event(file_id=FILE_ID, file_type=FileType.IMAGE, file_name="img.jpg")

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/img.jpg")

    mock_image_embedder = MagicMock()
    mock_image_embedder.embed_image.return_value = _make_fake_embedding(512)
    mock_image_embedder.extract_text.return_value = "ocr text"
    mock_image_embedder.embed_text.return_value = _make_fake_embedding(768)
    mock_image_embedder.generate_image_description = AsyncMock(return_value=None)

    captured_items = {}

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"

    def capture(index_name, items):
        captured_items[index_name] = items

    mock_chroma.upsert_items.side_effect = capture

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()

    with patch("src.rabbitmq.handlers.file_upload_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ImageEmbedderService", return_value=mock_image_embedder), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_upload_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/chunk_id_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await process_image(event)

    # Image chunk_id must be {file_id}#image#0
    image_items = captured_items.get("image_embeddings", [])
    assert len(image_items) == 1
    assert image_items[0]["chunk_id"] == f"{FILE_ID}#image#0"

    # Text chunk_id must be {file_id}#image#1
    text_items = captured_items.get("text_embeddings", [])
    assert len(text_items) == 1
    assert text_items[0]["chunk_id"] == f"{FILE_ID}#image#1"

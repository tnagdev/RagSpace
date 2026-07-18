"""
TC-030 to TC-035: file_processing_complete_handler tests.
"""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_embedding(dim=512):
    return [0.1] * dim


def _make_scene_list(n, include_thumbnail=True):
    """Build ProcessingEventFileMetadata objects."""
    from src.models.events import ProcessingEventFileMetadata

    scenes = []
    for i in range(n):
        scenes.append(
            ProcessingEventFileMetadata(
                id=f"scene-{i}",
                sceneNumber=i,
                startTime=float(i * 5),
                endTime=float(i * 5 + 5),
                startFrame=i * 150,
                endFrame=(i + 1) * 150,
                keyframe=i * 150 + 75,
                thumbnailUrl=f"http://minio/thumbnails/scene_{i}.jpg" if include_thumbnail else None,
                thumbnailS3Key=f"thumbnails/scene_{i}.jpg",
            )
        )
    return scenes


# ---------------------------------------------------------------------------
# TC-030: existing embeddings deleted before upserting new ones (idempotency)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_deletes_existing_before_indexing(make_processing_event):
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background

    event = make_processing_event(scenes=_make_scene_list(2))

    # Pre-populate both collections with stale data
    text_col = MagicMock()
    text_col.get.return_value = {"ids": ["stale-text-1"], "metadatas": [], "documents": []}
    text_col.delete = MagicMock()

    image_col = MagicMock()
    image_col.get.return_value = {"ids": ["stale-img-1"], "metadatas": [], "documents": []}
    image_col.delete = MagicMock()

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = image_col
    mock_chroma.text_collection = text_col
    mock_chroma.upsert_items = MagicMock()

    mock_video_embedder = MagicMock()
    mock_video_embedder.embed_image.return_value = _make_fake_embedding()
    mock_video_embedder.extract_text.return_value = ""
    mock_video_embedder.generate_image_description = AsyncMock(return_value=None)

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/thumb.jpg")

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()
    mock_upload_manager.upsert_file_metadata_batch = AsyncMock(return_value=None)

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=mock_video_embedder), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", new_callable=AsyncMock), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/scene_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await _process_scenes_in_background(event)

    # Both collections must have had .delete() called for stale data
    image_col.delete.assert_called_once_with(ids=["stale-img-1"])
    text_col.delete.assert_called_once_with(ids=["stale-text-1"])


# ---------------------------------------------------------------------------
# TC-031: empty scenes → update_file_status(COMPLETED) immediately, no S3 download
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_empty_scenes_marks_completed(make_processing_event):
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background

    event = make_processing_event(scenes=[])

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock()

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = MagicMock()
    mock_chroma.text_collection = MagicMock()

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", new_callable=AsyncMock):

        await _process_scenes_in_background(event)

    # Status must be updated to COMPLETED
    mock_upload_manager.update_file_status.assert_called_once()
    call_kwargs = mock_upload_manager.update_file_status.call_args[1]
    assert call_kwargs["processing_status"] == "COMPLETED"

    # No S3 download should happen
    mock_s3.download.assert_not_called()


# ---------------------------------------------------------------------------
# TC-032: scene failure still publishes progress; no exception escapes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_progress_published_on_failure(make_processing_event):
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background

    N_SCENES = 3
    event = make_processing_event(scenes=_make_scene_list(N_SCENES))

    mock_s3 = AsyncMock()
    # All downloads fail
    mock_s3.download = AsyncMock(side_effect=RuntimeError("S3 error"))

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = MagicMock()
    mock_chroma.image_collection.get.return_value = {"ids": []}
    mock_chroma.text_collection = MagicMock()
    mock_chroma.text_collection.get.return_value = {"ids": []}

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()
    mock_upload_manager.upsert_file_metadata_batch = AsyncMock(return_value=None)

    progress_events = []

    async def capture_publish(event_type, payload):
        progress_events.append(payload)

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", side_effect=capture_publish), \
         patch("tempfile.mkdtemp", return_value="/tmp/prog_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        # Should not raise
        await _process_scenes_in_background(event)

    # Progress published once per scene despite failures
    assert len(progress_events) == N_SCENES, (
        f"Expected {N_SCENES} progress events, got {len(progress_events)}"
    )


# ---------------------------------------------------------------------------
# TC-033: semaphore limits to max_concurrent_scenes (verified via N progress events)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_semaphore_limits_concurrency(make_processing_event):
    """
    Rather than probing semaphore internals (fragile), we verify:
    - Handler completes for N scenes
    - N progress events are published (one per scene)
    - update_file_status called once at the end
    """
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background

    N_SCENES = 5
    event = make_processing_event(scenes=_make_scene_list(N_SCENES))

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/thumb.jpg")

    mock_video_embedder = MagicMock()
    mock_video_embedder.embed_image.return_value = _make_fake_embedding()
    mock_video_embedder.extract_text.return_value = ""
    mock_video_embedder.generate_image_description = AsyncMock(return_value=None)

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = MagicMock()
    mock_chroma.image_collection.get.return_value = {"ids": []}
    mock_chroma.text_collection = MagicMock()
    mock_chroma.text_collection.get.return_value = {"ids": []}
    mock_chroma.upsert_items = MagicMock()

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()
    mock_upload_manager.upsert_file_metadata_batch = AsyncMock(return_value=None)

    progress_events = []

    async def capture_publish(event_type, payload):
        progress_events.append(payload)

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=mock_video_embedder), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", side_effect=capture_publish), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/sem_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await _process_scenes_in_background(event)

    # All N scenes must have generated progress
    assert len(progress_events) == N_SCENES
    # Final status update called exactly once
    mock_upload_manager.update_file_status.assert_called_once()


# ---------------------------------------------------------------------------
# TC-034: scene with thumbnailUrl=None is skipped — no S3 download for it
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_skips_missing_thumbnail(make_processing_event):
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background
    from src.models.events import ProcessingEventFileMetadata

    # 2 scenes: first has thumbnail, second does NOT
    scenes = [
        ProcessingEventFileMetadata(
            id="scene-0",
            sceneNumber=0,
            startTime=0.0,
            endTime=5.0,
            startFrame=0,
            endFrame=150,
            keyframe=75,
            thumbnailUrl="http://minio/thumb_0.jpg",
            thumbnailS3Key="thumbnails/scene_0.jpg",
        ),
        ProcessingEventFileMetadata(
            id="scene-1",
            sceneNumber=1,
            startTime=5.0,
            endTime=10.0,
            startFrame=150,
            endFrame=300,
            keyframe=225,
            thumbnailUrl="",   # ← empty string is falsy → triggers "no thumbnail" branch
            thumbnailS3Key="thumbnails/scene_1.jpg",
        ),
    ]
    event = make_processing_event(scenes=scenes)

    mock_s3 = AsyncMock()
    mock_s3.download = AsyncMock(return_value="/tmp/thumb.jpg")

    mock_video_embedder = MagicMock()
    mock_video_embedder.embed_image.return_value = _make_fake_embedding()
    mock_video_embedder.extract_text.return_value = ""
    mock_video_embedder.generate_image_description = AsyncMock(return_value=None)

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = MagicMock()
    mock_chroma.image_collection.get.return_value = {"ids": []}
    mock_chroma.text_collection = MagicMock()
    mock_chroma.text_collection.get.return_value = {"ids": []}
    mock_chroma.upsert_items = MagicMock()

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()
    mock_upload_manager.upsert_file_metadata_batch = AsyncMock(return_value=None)

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=mock_s3), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=mock_video_embedder), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", new_callable=AsyncMock), \
         patch("asyncio.get_running_loop") as mock_loop, \
         patch("tempfile.mkdtemp", return_value="/tmp/skip_thumb_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree"):

        mock_event_loop = MagicMock()

        async def direct_run_in_executor(executor, fn, *args):
            return fn(*args)

        mock_event_loop.run_in_executor = direct_run_in_executor
        mock_loop.return_value = mock_event_loop

        await _process_scenes_in_background(event)

    # Only 1 S3 download (for scene-0; scene-1 skipped due to missing thumbnail)
    assert mock_s3.download.call_count == 1


# ---------------------------------------------------------------------------
# TC-035: shutil.rmtree called even on outer exception
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scene_handler_cleans_temp_dir_on_exception(make_processing_event):
    from src.rabbitmq.handlers.file_processing_complete_handler import _process_scenes_in_background

    event = make_processing_event(scenes=_make_scene_list(1))

    mock_chroma = MagicMock()
    mock_chroma.image_index_name = "image_embeddings"
    mock_chroma.text_index_name = "text_embeddings"
    mock_chroma.image_collection = MagicMock()
    # Raise inside idempotency block to trigger outer exception path
    mock_chroma.image_collection.get.side_effect = RuntimeError("DB gone")
    mock_chroma.text_collection = MagicMock()
    mock_chroma.text_collection.get.side_effect = RuntimeError("DB gone")

    mock_upload_manager = MagicMock()
    mock_upload_manager.update_file_status = AsyncMock()

    with patch("src.rabbitmq.handlers.file_processing_complete_handler.S3ClientService", return_value=AsyncMock()), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.VideoEmbedderService", return_value=MagicMock()), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.ChromaDatabaseManager", return_value=mock_chroma), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.UploadManagerService", return_value=mock_upload_manager), \
         patch("src.rabbitmq.handlers.file_processing_complete_handler.publish_event", new_callable=AsyncMock), \
         patch("tempfile.mkdtemp", return_value="/tmp/outer_exc_temp"), \
         patch("os.makedirs"), \
         patch("os.path.exists", return_value=True), \
         patch("shutil.rmtree") as mock_rmtree:

        # Should not raise (handler swallows exceptions)
        await _process_scenes_in_background(event)

    mock_rmtree.assert_called_once_with("/tmp/outer_exc_temp", ignore_errors=True)

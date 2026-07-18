"""TC-24 to TC-32: RabbitMQ event handler tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.rabbitmq.handlers.file_deleted_handler import handle_file_deleted
from src.rabbitmq.handlers.file_upload_completed_handler import handle_file_upload_completed
from src.models.events import (
    FileDeletedEventModel,
    FileDeletedEventData,
    UploadCompletedEventModel,
    UploadEventFileMetadata,
    AuthUser,
)
from src.models.enums import EventType, FileType


# ── helpers ────────────────────────────────────────────────────────────────────

def _user():
    return AuthUser(id="user-123", email="test@test.com", username="tester")


def _deleted_event(file_id=None, file_ids=None):
    return FileDeletedEventModel(
        fileId=file_id,
        fileIds=file_ids,
        user=_user(),
        timestamp="2024-01-01T00:00:00Z",
        data=FileDeletedEventData(fileType=FileType.VIDEO, fileName="video.mp4"),
    )


def _mock_scene(key="thumbnails/user/scene.jpg"):
    s = MagicMock()
    s.thumbnailS3Key = key
    return s


def _prisma_ctx(scenes=None, delete_return=1):
    prisma = MagicMock()
    prisma.scene.find_many = AsyncMock(return_value=scenes or [])
    prisma.scene.delete_many = AsyncMock(return_value=delete_return)
    svc = MagicMock()
    svc.ensure_connected = AsyncMock()
    svc.prisma = prisma
    return svc, prisma


# ── handle_file_deleted ────────────────────────────────────────────────────────

class TestFileDeletedHandler:

    async def test_single_file_id_deletes_scenes_and_thumbnails(self):
        """TC-24: Single fileId → scenes fetched, S3 + DB cleaned up."""
        event = _deleted_event(file_id="file-456")
        scene = _mock_scene()
        ps, prisma = _prisma_ctx(scenes=[scene])
        s3 = MagicMock()
        s3.delete_files_batch = AsyncMock(return_value=1)

        with patch("src.rabbitmq.handlers.file_deleted_handler.PrismaService", return_value=ps), \
             patch("src.rabbitmq.handlers.file_deleted_handler.S3Service", return_value=s3):
            await handle_file_deleted(event)

        prisma.scene.find_many.assert_called_once()
        s3.delete_files_batch.assert_called_once_with([scene.thumbnailS3Key])
        prisma.scene.delete_many.assert_called_once()

    async def test_multiple_file_ids_processed(self):
        """TC-25: fileIds list → all IDs forwarded to DB query."""
        event = _deleted_event(file_ids=["f1", "f2", "f3"])
        ps, prisma = _prisma_ctx(scenes=[_mock_scene()])
        s3 = MagicMock()
        s3.delete_files_batch = AsyncMock(return_value=1)

        with patch("src.rabbitmq.handlers.file_deleted_handler.PrismaService", return_value=ps), \
             patch("src.rabbitmq.handlers.file_deleted_handler.S3Service", return_value=s3):
            await handle_file_deleted(event)

        call_kwargs = prisma.scene.find_many.call_args[1]
        ids_in = call_kwargs["where"]["fileId"]["in"]
        assert set(ids_in) == {"f1", "f2", "f3"}

    async def test_duplicate_ids_deduplicated(self):
        """TC-26: fileId + fileIds overlap → deduplicated before query."""
        event = _deleted_event(file_id="f1", file_ids=["f1", "f2"])
        ps, prisma = _prisma_ctx(scenes=[])

        with patch("src.rabbitmq.handlers.file_deleted_handler.PrismaService", return_value=ps):
            await handle_file_deleted(event)

        call_kwargs = prisma.scene.find_many.call_args[1]
        ids_in = call_kwargs["where"]["fileId"]["in"]
        assert len(ids_in) == 2
        assert set(ids_in) == {"f1", "f2"}

    async def test_missing_file_ids_logs_error_without_crash(self):
        """TC-27: No fileId or fileIds → ValueError caught, no exception propagated."""
        event = FileDeletedEventModel(
            fileId=None,
            fileIds=None,
            user=_user(),
            timestamp="2024-01-01T00:00:00Z",
            data=FileDeletedEventData(fileType=FileType.VIDEO, fileName="video.mp4"),
        )
        # Should complete without raising
        await handle_file_deleted(event)

    async def test_no_scenes_found_skips_s3_deletion(self):
        """TC-28: DB finds no scenes → S3 not called, delete_many still called."""
        event = _deleted_event(file_id="empty-file")
        ps, prisma = _prisma_ctx(scenes=[])
        s3 = MagicMock()
        s3.delete_files_batch = AsyncMock()

        with patch("src.rabbitmq.handlers.file_deleted_handler.PrismaService", return_value=ps), \
             patch("src.rabbitmq.handlers.file_deleted_handler.S3Service", return_value=s3):
            await handle_file_deleted(event)

        s3.delete_files_batch.assert_not_called()
        prisma.scene.delete_many.assert_called_once()

    async def test_null_thumbnail_key_excluded_from_s3_batch(self):
        """TC-29: Scene with thumbnailS3Key=None is not included in S3 delete call."""
        event = _deleted_event(file_id="file-null-thumb")
        scene = _mock_scene(key=None)
        ps, prisma = _prisma_ctx(scenes=[scene])
        s3 = MagicMock()
        s3.delete_files_batch = AsyncMock()

        with patch("src.rabbitmq.handlers.file_deleted_handler.PrismaService", return_value=ps), \
             patch("src.rabbitmq.handlers.file_deleted_handler.S3Service", return_value=s3):
            await handle_file_deleted(event)

        # thumbnail_keys list is empty → delete_files_batch not called
        s3.delete_files_batch.assert_not_called()


# ── handle_file_upload_completed ───────────────────────────────────────────────

class TestFileUploadCompletedHandler:

    async def test_missing_file_id_logs_error_without_crash(self):
        """TC-30: fileId=None → ValueError caught and logged, no exception raised."""
        event = MagicMock()
        event.fileId = None
        event.user = _user()

        await handle_file_upload_completed(event)

    async def test_missing_user_logs_error_without_crash(self):
        """TC-31: user=None → ValueError caught and logged, no exception raised."""
        event = MagicMock()
        event.fileId = "file-abc"
        event.user = None

        await handle_file_upload_completed(event)

    async def test_valid_event_calls_scene_processor(self):
        """TC-32: Valid event → SceneProcessor.process_file invoked."""
        event = UploadCompletedEventModel(
            fileId="file-xyz",
            user=_user(),
            timestamp="2024-01-01T00:00:00Z",
            data=UploadEventFileMetadata(
                s3Key="uploads/video.mp4",
                fileType=FileType.VIDEO,
                fileName="video.mp4",
            ),
        )

        with patch("src.rabbitmq.handlers.file_upload_completed_handler.SceneProcessor") as MockSP:
            instance = MagicMock()
            instance.process_file = AsyncMock()
            MockSP.return_value = instance

            await handle_file_upload_completed(event)

        instance.process_file.assert_called_once_with("file-xyz", event)

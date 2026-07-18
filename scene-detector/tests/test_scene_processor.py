"""TC-50 to TC-56: SceneProcessor.process_file orchestration tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from src.services.scene_processor import SceneProcessor
from src.models.events import UploadCompletedEventModel, AuthUser, UploadEventFileMetadata
from src.models.enums import EventType, FileType, ProcessingStatus, ProcessingStage


# ── helpers ────────────────────────────────────────────────────────────────────

def _user():
    return AuthUser(id="user-456", email="user@test.com")


def _event(file_type: str = "VIDEO") -> UploadCompletedEventModel:
    return UploadCompletedEventModel(
        fileId="file-123",
        user=_user(),
        timestamp="2024-01-01T00:00:00Z",
        data=UploadEventFileMetadata(
            s3Key="uploads/video.mp4",
            fileType=FileType(file_type),
            fileName="video.mp4",
        ),
    )


def _file_record(file_type: str = "VIDEO", youtube_url=None) -> dict:
    return {
        "id": "file-123",
        "fileType": file_type,
        "s3Key": "uploads/video.mp4",
        "s3Bucket": "user-uploads",
        "originalFilename": "video.mp4",
        "filename": "video.mp4",
        "metadata": {},
        "youtubeUrl": youtube_url,
    }


def _scenes_data(count: int = 1) -> list:
    return [
        {
            "scene_number": i + 1,
            "start_time": float(i * 5),
            "end_time": float((i + 1) * 5),
            "start_frame": i * 150,
            "end_frame": (i + 1) * 150,
            "keyframe": i * 150 + 75,
            "duration": 5.0,
        }
        for i in range(count)
    ]


def _mock_db_scene(number: int = 1):
    s = MagicMock()
    s.id = f"db-scene-{number}"
    s.sceneNumber = number
    return s


# ── fixture: SceneProcessor with all heavy deps mocked ────────────────────────

@pytest.fixture
def proc(monkeypatch):
    """
    Yields a dict with:
      - 'svc': the SceneProcessor instance
      - 'mq', 'umc', 's3', 'sds', 'prisma': the mock objects wired into it
    All filesystem-touching calls are replaced with no-ops.
    """
    with patch("src.services.scene_processor.RabbitMQProducer") as MockMQ, \
         patch("src.services.scene_processor.UploadManagerClient") as MockUMC, \
         patch("src.services.scene_processor.S3Service") as MockS3, \
         patch("src.services.scene_processor.SceneDetectionService") as MockSDS, \
         patch("src.services.scene_processor.YouTubeDownloaderService") as MockYT, \
         patch("src.services.scene_processor.PrismaService") as MockPrisma, \
         patch("src.services.scene_processor.os.makedirs"), \
         patch("src.services.scene_processor.tempfile.mkdtemp", return_value="/tmp/mock_work"), \
         patch("src.services.scene_processor.shutil.rmtree"), \
         patch("src.services.scene_processor.os.path.exists", return_value=False):

        mq = MagicMock()
        mq.publish_event = AsyncMock()
        MockMQ.return_value = mq

        umc = MagicMock()
        umc.get_file = AsyncMock(return_value=_file_record())
        umc.update_file_status = AsyncMock()
        MockUMC.return_value = umc

        s3 = MagicMock()
        s3.download_file = AsyncMock()
        s3.upload_file = AsyncMock()
        s3.get_signed_url = AsyncMock(return_value="https://signed.url/thumb.jpg")
        MockS3.return_value = s3

        sds = MagicMock()
        sds.generate_file_thumbnail = AsyncMock(return_value="/tmp/mock_work/thumb.jpg")
        sds.detect_scenes = MagicMock(return_value=[])
        sds.extract_thumbnail = AsyncMock(return_value="/tmp/mock_work/scene.jpg")
        MockSDS.return_value = sds

        MockYT.return_value = MagicMock()

        prisma_obj = MagicMock()
        prisma_obj.scene.count = AsyncMock(return_value=0)
        prisma_obj.scene.delete_many = AsyncMock()
        prisma_obj.scene.create_many = AsyncMock()
        prisma_obj.scene.find_many = AsyncMock(return_value=[])
        prisma_svc = MagicMock()
        prisma_svc.prisma = prisma_obj
        MockPrisma.return_value = prisma_svc

        svc = SceneProcessor(user=MagicMock(), session=None)

        yield {
            "svc": svc,
            "mq": mq,
            "umc": umc,
            "s3": s3,
            "sds": sds,
            "prisma": prisma_obj,
        }


# ── tests ──────────────────────────────────────────────────────────────────────

class TestSceneProcessorProcessFile:

    async def test_file_not_found_raises_exception(self, proc):
        """TC-50: get_file returns None → exception raised immediately."""
        proc["umc"].get_file = AsyncMock(return_value=None)

        with pytest.raises(Exception, match="File not found"):
            await proc["svc"].process_file("file-123", _event())

    async def test_existing_scenes_deleted_before_reprocess(self, proc):
        """TC-51: Idempotency — stale scenes wiped before inserting new ones."""
        proc["prisma"].scene.count = AsyncMock(return_value=3)
        proc["sds"].detect_scenes = MagicMock(return_value=[])

        await proc["svc"].process_file("file-123", _event())

        proc["prisma"].scene.delete_many.assert_called_once_with(
            where={"fileId": "file-123"}
        )

    async def test_non_video_file_skips_scene_detection(self, proc):
        """TC-52: IMAGE file → detect_scenes never called, COMPLETED status published."""
        proc["umc"].get_file = AsyncMock(return_value=_file_record(file_type="IMAGE"))

        await proc["svc"].process_file("file-123", _event(file_type="IMAGE"))

        proc["sds"].detect_scenes.assert_not_called()

        statuses = [
            c[0][1].processingStatus
            for c in proc["umc"].update_file_status.call_args_list
            if c[0][1].processingStatus
        ]
        assert ProcessingStatus.COMPLETED.value in statuses

    async def test_no_scenes_detected_marks_file_completed(self, proc):
        """TC-53: detect_scenes returns [] → file marked COMPLETED, scenes_detected=0."""
        proc["sds"].detect_scenes = MagicMock(return_value=[])

        await proc["svc"].process_file("file-123", _event())

        statuses = [
            c[0][1].processingStatus
            for c in proc["umc"].update_file_status.call_args_list
            if c[0][1].processingStatus
        ]
        assert ProcessingStatus.COMPLETED.value in statuses

    async def test_success_creates_scenes_and_publishes_completion_event(self, proc):
        """TC-54: detect_scenes returns data → DB create_many called and completion event published."""
        scenes = _scenes_data(count=2)
        proc["sds"].detect_scenes = MagicMock(return_value=scenes)
        proc["prisma"].scene.find_many = AsyncMock(
            return_value=[_mock_db_scene(1), _mock_db_scene(2)]
        )

        await proc["svc"].process_file("file-123", _event())

        proc["prisma"].scene.create_many.assert_called_once()

        published_types = [c[0][0] for c in proc["mq"].publish_event.call_args_list]
        assert EventType.PROCESSING_COMPLETED.value in published_types

    async def test_exception_marks_file_failed_and_publishes_failure_event(self, proc):
        """TC-55: S3 download error → FAILED status set and failure event published."""
        proc["s3"].download_file = AsyncMock(side_effect=RuntimeError("S3 timeout"))

        with pytest.raises(RuntimeError, match="S3 timeout"):
            await proc["svc"].process_file("file-123", _event())

        statuses = [
            c[0][1].processingStatus
            for c in proc["umc"].update_file_status.call_args_list
            if c[0][1].processingStatus
        ]
        assert ProcessingStatus.FAILED.value in statuses

        published_types = [c[0][0] for c in proc["mq"].publish_event.call_args_list]
        assert EventType.PROCESSING_FAILED.value in published_types

    async def test_partial_scene_failure_records_audit_metadata(self, proc):
        """TC-57: 2/3 scenes succeed, 1 fails → create_many gets 2 scenes,
        metadata records scenes_failed=1 / failed_scene_numbers=[2], completion still fires."""
        scenes = _scenes_data(count=3)
        proc["sds"].detect_scenes = MagicMock(return_value=scenes)
        proc["prisma"].scene.find_many = AsyncMock(
            return_value=[_mock_db_scene(1), _mock_db_scene(3)]
        )

        async def _fake_process(scene_data, *args, **kwargs):
            n = scene_data["scene_number"]
            if n == 2:
                return {"_failed": True, "scene_number": 2, "error": "thumbnail error"}
            return {
                "fileId": "file-123",
                "userId": "user-456",
                "sceneNumber": n,
                "startTime": scene_data["start_time"],
                "endTime": scene_data["end_time"],
                "startFrame": scene_data["start_frame"],
                "endFrame": scene_data["end_frame"],
                "keyframe": scene_data["keyframe"],
                "duration": scene_data["duration"],
                "thumbnailS3Key": f"thumbnails/user-456/2024/1/scenes/file-123/scene_{n:04d}.jpg",
                "thumbnailS3Url": "https://signed.url/thumb.jpg",
            }

        proc["svc"]._process_single_scene = _fake_process

        await proc["svc"].process_file("file-123", _event())

        # Only 2 successful scenes written to DB
        create_data = proc["prisma"].scene.create_many.call_args[1]["data"]
        assert len(create_data) == 2
        assert all(s["sceneNumber"] != 2 for s in create_data)

        # Audit metadata captured in the update_file_status call that moves to INDEXING
        all_metadata = [
            c[0][1].metadata
            for c in proc["umc"].update_file_status.call_args_list
            if c[0][1].metadata
        ]
        audit = next(
            (m for m in all_metadata if m.get("scenes_failed") is not None), None
        )
        assert audit is not None, "Expected update_file_status call with scenes_failed key"
        assert audit["scenes_failed"] == 1
        assert audit["failed_scene_numbers"] == [2]
        assert audit["scenes_detected"] == 2
        assert audit["scenes_total"] == 3

        # Partial success still triggers PROCESSING_COMPLETED (not FAILED)
        published = [c[0][0] for c in proc["mq"].publish_event.call_args_list]
        assert EventType.PROCESSING_COMPLETED.value in published
        assert EventType.PROCESSING_FAILED.value not in published

    async def test_temp_directory_cleaned_up_even_on_exception(self):
        """TC-56: shutil.rmtree always called in finally, even when processing fails."""
        with patch("src.services.scene_processor.RabbitMQProducer") as MockMQ, \
             patch("src.services.scene_processor.UploadManagerClient") as MockUMC, \
             patch("src.services.scene_processor.S3Service") as MockS3, \
             patch("src.services.scene_processor.SceneDetectionService") as MockSDS, \
             patch("src.services.scene_processor.YouTubeDownloaderService"), \
             patch("src.services.scene_processor.PrismaService") as MockPrisma, \
             patch("src.services.scene_processor.os.makedirs"), \
             patch("src.services.scene_processor.tempfile.mkdtemp", return_value="/tmp/test_cleanup"), \
             patch("src.services.scene_processor.shutil.rmtree") as mock_rmtree, \
             patch("src.services.scene_processor.os.path.exists", return_value=True):

            mq = MagicMock(); mq.publish_event = AsyncMock()
            MockMQ.return_value = mq

            umc = MagicMock()
            umc.get_file = AsyncMock(return_value=_file_record())
            umc.update_file_status = AsyncMock()
            MockUMC.return_value = umc

            s3 = MagicMock()
            s3.download_file = AsyncMock(side_effect=RuntimeError("network error"))
            MockS3.return_value = s3

            sds = MagicMock()
            sds.generate_file_thumbnail = AsyncMock(return_value="/tmp/test_cleanup/thumb.jpg")
            MockSDS.return_value = sds

            prisma_obj = MagicMock()
            prisma_obj.scene.count = AsyncMock(return_value=0)
            prisma_obj.scene.delete_many = AsyncMock()
            prisma_svc = MagicMock()
            prisma_svc.prisma = prisma_obj
            MockPrisma.return_value = prisma_svc

            svc = SceneProcessor(user=MagicMock(), session=None)

            with pytest.raises(RuntimeError):
                await svc.process_file("file-123", _event())

            mock_rmtree.assert_called_once_with("/tmp/test_cleanup")

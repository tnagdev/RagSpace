"""
TC-60 to TC-63: tests for scene progress changes in scene_processor.py

- _publish_scene_progress called with (file_id, user_id, 0, total_scenes) BEFORE gather
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from src.services.scene_processor import SceneProcessor
from src.models.events import UploadCompletedEventModel, AuthUser, UploadEventFileMetadata
from src.models.enums import EventType, ProcessingStage


# ── helpers ───────────────────────────────────────────────────────────────────

def _user():
    return AuthUser(id="user-456", email="user@test.com")


def _event() -> UploadCompletedEventModel:
    return UploadCompletedEventModel(
        fileId="file-123",
        user=_user(),
        timestamp="2024-01-01T00:00:00Z",
        data=UploadEventFileMetadata(
            s3Key="uploads/video.mp4",
            fileType="VIDEO",
            fileName="video.mp4",
        ),
    )


def _file_record(count: int = 2):
    return {
        "id": "file-123",
        "fileType": "VIDEO",
        "s3Key": "uploads/video.mp4",
        "s3Bucket": "user-uploads",
        "originalFilename": "video.mp4",
        "filename": "video.mp4",
        "metadata": {},
        "youtubeUrl": None,
    }


def _scenes_data(count: int = 2) -> list:
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


# ── shared proc fixture (mirrors the one in test_scene_processor.py) ──────────

@pytest.fixture
def proc():
    with patch("src.services.scene_processor.RabbitMQProducer") as MockMQ, \
         patch("src.services.scene_processor.UploadManagerClient") as MockUMC, \
         patch("src.services.scene_processor.S3Service") as MockS3, \
         patch("src.services.scene_processor.SceneDetectionService") as MockSDS, \
         patch("src.services.scene_processor.YouTubeDownloaderService"), \
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

        prisma_obj = MagicMock()
        prisma_obj.scene.count = AsyncMock(return_value=0)
        prisma_obj.scene.delete_many = AsyncMock()
        prisma_obj.scene.create_many = AsyncMock()
        prisma_obj.scene.find_many = AsyncMock(return_value=[])
        prisma_svc = MagicMock()
        prisma_svc.prisma = prisma_obj
        MockPrisma.return_value = prisma_svc

        svc = SceneProcessor(user=MagicMock(), session=None)

        yield {"svc": svc, "mq": mq, "umc": umc, "s3": s3, "sds": sds, "prisma": prisma_obj}


# ── TC-60: _publish_scene_progress sends correct event with 0% ───────────────

@pytest.mark.asyncio
async def test_publish_scene_progress_zero_percent(proc):
    """TC-60: _publish_scene_progress(file_id, user_id, 0, 10) publishes
    PROCESSING_PROGRESS with stage=SCENE_DETECTION and progress=0."""
    await proc["svc"]._publish_scene_progress("file-123", "user-456", 0, 10)

    proc["mq"].publish_event.assert_awaited_once()
    event_type = proc["mq"].publish_event.await_args[0][0]
    payload = proc["mq"].publish_event.await_args[0][1]

    assert event_type == EventType.PROCESSING_PROGRESS.value
    assert payload["data"]["stage"] == ProcessingStage.SCENE_DETECTION.value
    assert payload["data"]["progress"] == 0
    assert payload["fileId"] == "file-123"
    assert payload["userId"] == "user-456"


# ── TC-61: percentage calculation ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_scene_progress_percentage(proc):
    """TC-61: done=5, total=10 → progress=50."""
    await proc["svc"]._publish_scene_progress("file-123", "user-456", 5, 10)

    payload = proc["mq"].publish_event.await_args[0][1]
    assert payload["data"]["progress"] == 50


# ── TC-62: 0% emitted BEFORE gather ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_zero_progress_published_before_first_scene(proc):
    """TC-62: _publish_scene_progress(0, total) is called BEFORE any
    _process_single_scene invocation (i.e., before asyncio.gather starts)."""
    call_order: list[str] = []

    original_publish = proc["svc"]._publish_scene_progress

    async def tracking_publish(file_id, user_id, completed, total):
        call_order.append(f"publish:{completed}/{total}")

    proc["svc"]._publish_scene_progress = tracking_publish

    # _process_single_scene is called inside gather; we track its call order
    async def tracking_process(scene_data, *args, **kwargs):
        call_order.append(f"scene:{scene_data['scene_number']}")
        return {
            "fileId": "file-123", "userId": "user-456",
            "sceneNumber": scene_data["scene_number"],
            "startTime": 0.0, "endTime": 5.0,
            "startFrame": 0, "endFrame": 150,
            "keyframe": 75, "duration": 5.0,
            "thumbnailS3Key": "key", "thumbnailS3Url": "url",
        }

    proc["svc"]._process_single_scene = tracking_process

    proc["sds"].detect_scenes = MagicMock(return_value=_scenes_data(count=2))
    proc["prisma"].scene.find_many = AsyncMock(return_value=[
        MagicMock(id="db-1", sceneNumber=1),
        MagicMock(id="db-2", sceneNumber=2),
    ])

    await proc["svc"].process_file("file-123", _event())

    # "publish:0/2" must appear before the first "scene:N" entry
    zero_idx = next(
        (i for i, s in enumerate(call_order) if s == "publish:0/2"), None
    )
    scene_indices = [i for i, s in enumerate(call_order) if s.startswith("scene:")]

    assert zero_idx is not None, (
        f"Expected _publish_scene_progress(0, total) to be called. Order: {call_order}"
    )
    assert scene_indices, (
        "Expected at least one _process_single_scene call. Order: {call_order}"
    )
    assert zero_idx < min(scene_indices), (
        f"0% progress (idx={zero_idx}) must appear BEFORE first scene processing "
        f"(idx={min(scene_indices)}). Full order: {call_order}"
    )


# ── TC-63: _publish_scene_progress swallows exceptions ───────────────────────

@pytest.mark.asyncio
async def test_publish_scene_progress_swallows_exception(proc):
    """TC-63: A publish_event failure inside _publish_scene_progress does NOT raise."""
    proc["mq"].publish_event = AsyncMock(side_effect=Exception("RabbitMQ down"))

    # Must not raise
    await proc["svc"]._publish_scene_progress("file-123", "user-456", 0, 10)

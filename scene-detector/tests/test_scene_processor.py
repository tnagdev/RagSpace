from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.services import scene_processor as module
from src.services.scene_processor import SceneProcessor


def _upload(file_type=common_pb2.FILE_TYPE_VIDEO, youtube_url=None) -> events_pb2.FileUploaded:
    upload = events_pb2.FileUploaded(
        file_id="file-1", user_id="user-1", type=file_type, bucket="bucket", key="uploads/u/clip.mp4"
    )
    if youtube_url:
        upload.youtube_url = youtube_url
    return upload


def _scenes(count: int) -> list[dict]:
    return [
        {
            "scene_number": i + 1,
            "start_time": i * 5.0,
            "end_time": (i + 1) * 5.0,
            "start_frame": i * 150,
            "end_frame": (i + 1) * 150,
            "keyframe": i * 150 + 75,
            "duration": 5.0,
        }
        for i in range(count)
    ]


@pytest.fixture
def processor(tmp_path):
    with (
        patch.object(module, "S3Service") as s3_cls,
        patch.object(module, "SceneDetectionService") as detector_cls,
        patch.object(module, "YouTubeDownloaderService") as youtube_cls,
        patch.object(module, "PrismaService") as prisma_cls,
        patch.object(module.settings, "temp_dir", str(tmp_path)),
        patch.object(module, "report_stage", new_callable=AsyncMock) as report,
        patch.object(module, "event_bus") as bus,
    ):
        s3 = s3_cls.return_value
        s3.download_file = AsyncMock()
        s3.upload_file = AsyncMock()
        detector = detector_cls.return_value
        detector.generate_file_thumbnail = AsyncMock()
        detector.extract_thumbnail = AsyncMock()
        detector.detect_scenes = MagicMock(return_value=_scenes(3))
        youtube_cls.return_value.download_video = AsyncMock(
            return_value={"title": "My clip", "file_size": 1234, "duration": 61.4, "description": "d"}
        )
        db = prisma_cls.return_value
        db.ensure_connected = AsyncMock()
        db.prisma.scene.delete_many = AsyncMock(return_value=0)
        db.prisma.scene.create_many = AsyncMock()
        bus.publish = AsyncMock()
        yield SceneProcessor(), report, bus, detector, db, youtube_cls.return_value


def _stage_calls(report):
    return [(c.kwargs.get("stage"), c.kwargs.get("status")) for c in report.call_args_list if c.kwargs.get("stage")]


async def test_video_reports_progress_stores_scenes_and_publishes(processor):
    proc, report, bus, _, db, _ = processor
    await proc.process(_upload())

    stages = _stage_calls(report)
    assert stages[0] == (common_pb2.PROCESSING_STAGE_SCENE_DETECTION, common_pb2.PROCESSING_STATUS_IN_PROGRESS)
    assert stages[-1] == (common_pb2.PROCESSING_STAGE_INDEXING, common_pb2.PROCESSING_STATUS_IN_PROGRESS)
    assert report.call_args_list[-1].kwargs["attributes"] == {"scenesDetected": 3, "scenesTotal": 3}
    assert any(c.kwargs.get("thumbnail_key", "").endswith("/files/file-1.jpg") for c in report.call_args_list)
    assert len(db.prisma.scene.create_many.call_args.kwargs["data"]) == 3

    field, message = bus.publish.call_args.args
    assert field == "file_scenes_detected"
    assert message.scene_count == 3


async def test_non_video_only_reports_the_thumbnail(processor):
    proc, report, bus, detector, db, _ = processor
    await proc.process(_upload(common_pb2.FILE_TYPE_IMAGE))

    assert _stage_calls(report) == []
    assert report.call_args.kwargs["thumbnail_key"].endswith("/files/file-1.jpg")
    detector.detect_scenes.assert_not_called()
    db.prisma.scene.delete_many.assert_not_called()
    bus.publish.assert_not_called()


async def test_video_without_scenes_completes(processor):
    proc, report, bus, detector, _, _ = processor
    detector.detect_scenes.return_value = []
    await proc.process(_upload())

    assert _stage_calls(report)[-1] == (common_pb2.PROCESSING_STAGE_COMPLETED, common_pb2.PROCESSING_STATUS_COMPLETED)
    bus.publish.assert_not_called()


async def test_youtube_download_reports_title_and_size(processor):
    proc, report, _, _, _, youtube = processor
    await proc.process(_upload(common_pb2.FILE_TYPE_YOUTUBE_VIDEO, youtube_url="https://youtu.be/abc"))

    youtube.download_video.assert_awaited_once()
    enrichment = next(c.kwargs for c in report.call_args_list if c.kwargs.get("name"))
    assert enrichment["name"] == "My clip"
    assert enrichment["size_bytes"] == 1234
    assert enrichment["attributes"]["durationSeconds"] == 61


async def test_final_failure_reports_failed_and_raises(processor):
    proc, report, _, detector, _, _ = processor
    detector.detect_scenes.side_effect = RuntimeError("decoder crashed")

    with pytest.raises(RuntimeError):
        await proc.process(_upload(), is_final_attempt=True)

    failed = report.call_args_list[-1].kwargs
    assert failed["status"] == common_pb2.PROCESSING_STATUS_FAILED
    assert "decoder crashed" in failed["error"]


async def test_non_final_failure_does_not_report_failed(processor):
    proc, report, _, detector, _, _ = processor
    detector.detect_scenes.side_effect = RuntimeError("transient")

    with pytest.raises(RuntimeError):
        await proc.process(_upload(), is_final_attempt=False)

    assert all(c.kwargs.get("status") != common_pb2.PROCESSING_STATUS_FAILED for c in report.call_args_list)


async def test_all_thumbnails_failing_is_an_error(processor):
    proc, _, bus, detector, _, _ = processor
    detector.extract_thumbnail.side_effect = OSError("disk full")

    with pytest.raises(RuntimeError):
        await proc.process(_upload())
    bus.publish.assert_not_called()

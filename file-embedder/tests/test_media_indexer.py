from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.services import media_indexer as module


def _upload(file_type=common_pb2.FILE_TYPE_VIDEO, youtube_url=None) -> events_pb2.FileUploaded:
    upload = events_pb2.FileUploaded(
        file_id="file-1", user_id="user-1", name="clip", type=file_type, bucket="bucket", key="uploads/u/clip.bin"
    )
    if youtube_url:
        upload.youtube_url = youtube_url
    return upload


async def _inline(fn, *args):
    return fn(*args)


@pytest.fixture
def deps(chroma, tmp_path):
    embedder = MagicMock()
    embedder.embed_image.return_value = np.ones(4)
    embedder.embed_text.return_value = np.ones(4)
    embedder.extract_text.return_value = "STOP"
    embedder.transcribe_audio.return_value = {
        "segments": [{"text": "hello there", "start": 0.0, "end": 2.0}, {"text": "general", "start": 2.0, "end": 3.0}]
    }
    report = AsyncMock()
    with (
        patch.object(module, "VideoEmbedderService", return_value=embedder),
        patch.object(module, "S3ClientService") as s3_cls,
        patch.object(module, "YouTubeDownloaderService") as youtube_cls,
        patch.object(module, "report_stage", report),
        patch("src.events.report_stage", report),
        patch.object(module, "run_cpu", side_effect=_inline),
        patch.object(module, "has_audio_stream", return_value=True),
        patch.object(module, "extract_audio", side_effect=lambda src, dst: dst),
        patch.object(module.settings, "temp_dir", str(tmp_path)),
        patch.object(module.settings, "nvidia_api_key", None),
    ):
        s3_cls.return_value.download = AsyncMock(side_effect=lambda bucket, key, path: path)
        youtube_cls.return_value.download_video = AsyncMock()
        yield SimpleNamespace(embedder=embedder, report=report, chroma=chroma, youtube=youtube_cls.return_value)


def _final_stage(report):
    return report.call_args_list[-1].kwargs["stage"] if report.call_args_list else None


async def test_image_indexes_vectors_and_completes(deps):
    description = SimpleNamespace(
        summary="A stop sign", objects=["sign"], setting="street", style="photo", colors=["red"], characters_present=[]
    )
    with patch.object(module, "describe_image", AsyncMock(return_value=description)):
        await module.index_upload(_upload(common_pb2.FILE_TYPE_IMAGE))

    image = deps.chroma.image_collection.upsert.call_args.kwargs
    assert image["ids"] == ["file-1#image#0"]
    assert image["documents"] == ["A stop sign | STOP"]
    assert image["metadatas"][0]["visual_setting"] == "street"
    assert deps.chroma.text_collection.upsert.call_args.kwargs["ids"] == ["file-1#image#1"]
    assert _final_stage(deps.report) == common_pb2.PROCESSING_STAGE_COMPLETED


async def test_image_without_embedding_fails(deps):
    deps.embedder.embed_image.return_value = None
    with pytest.raises(RuntimeError):
        await module.index_upload(_upload(common_pb2.FILE_TYPE_IMAGE))
    deps.chroma.image_collection.upsert.assert_not_called()


async def test_audio_replaces_segments_and_completes(deps):
    await module.index_upload(_upload(common_pb2.FILE_TYPE_AUDIO))

    deps.chroma.text_collection.delete.assert_called_once()
    upsert = deps.chroma.text_collection.upsert.call_args.kwargs
    assert upsert["ids"] == ["file-1#audio#0", "file-1#audio#1"]
    assert upsert["metadatas"][0]["file_type"] == "AUDIO"
    assert _final_stage(deps.report) == common_pb2.PROCESSING_STAGE_COMPLETED


async def test_video_transcribes_without_completing(deps):
    await module.index_upload(_upload())

    assert deps.chroma.text_collection.upsert.call_args.kwargs["metadatas"][0]["file_type"] == "VIDEO"
    assert all(c.kwargs["stage"] == common_pb2.PROCESSING_STAGE_EMBEDDING for c in deps.report.call_args_list)
    assert deps.report.call_args_list[-1].kwargs["progress"] == 100


async def test_silent_video_skips_transcription(deps):
    with patch.object(module, "has_audio_stream", return_value=False):
        await module.index_upload(_upload())
    deps.embedder.transcribe_audio.assert_not_called()
    deps.chroma.text_collection.upsert.assert_not_called()


async def test_failed_transcription_raises(deps):
    deps.embedder.transcribe_audio.return_value = None
    with pytest.raises(RuntimeError, match="Transcription failed"):
        await module.index_upload(_upload(common_pb2.FILE_TYPE_AUDIO))


async def test_youtube_video_is_downloaded_from_youtube(deps):
    await module.index_upload(_upload(common_pb2.FILE_TYPE_YOUTUBE_VIDEO, youtube_url="https://youtu.be/x"))
    assert deps.youtube.download_video.await_args.args[0] == "https://youtu.be/x"


async def test_deleted_file_is_not_written(deps):
    with patch.object(module, "is_deleted", return_value=True):
        await module.index_upload(_upload(common_pb2.FILE_TYPE_AUDIO))
    deps.chroma.text_collection.upsert.assert_not_called()


async def test_unsupported_types_complete_immediately(deps):
    await module.index_upload(_upload(common_pb2.FILE_TYPE_DOCUMENT))
    assert _final_stage(deps.report) == common_pb2.PROCESSING_STAGE_COMPLETED

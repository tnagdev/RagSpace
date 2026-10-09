import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2
from ragspace.files.v1 import files_pb2

from src import handlers


def _envelope(**payload) -> events_pb2.Envelope:
    return events_pb2.Envelope(id="evt-1", **payload)


async def _inline(fn, *args):
    return fn(*args)


@pytest.fixture
def deps(chroma):
    with (
        patch.object(handlers, "file_exists", new_callable=AsyncMock, return_value=True) as exists,
        patch.object(handlers, "get_file", new_callable=AsyncMock) as get_file,
        patch.object(handlers, "list_scenes", new_callable=AsyncMock, return_value=[]),
        patch.object(handlers, "report_stage", new_callable=AsyncMock) as report,
        patch.object(handlers, "media_indexer") as media,
        patch.object(handlers, "scene_indexer") as scenes,
        patch.object(handlers, "run_cpu", side_effect=_inline),
        patch.object(handlers.asyncio, "sleep", new_callable=AsyncMock),
    ):
        get_file.return_value = files_pb2.File(id="f1", user_id="u1")
        media.index_upload = AsyncMock()
        scenes.index_scenes = AsyncMock()
        handlers._transcriptions.clear()
        yield MagicMock(exists=exists, get_file=get_file, report=report, media=media, scenes=scenes, chroma=chroma)


async def test_video_upload_registers_its_transcription(deps):
    upload = events_pb2.FileUploaded(file_id="f1", user_id="u1", type=common_pb2.FILE_TYPE_VIDEO)
    await handlers.handle_event(_envelope(file_uploaded=upload))
    task = handlers._transcriptions["f1"]
    assert await task is True
    await asyncio.sleep(0)
    deps.media.index_upload.assert_awaited_once()


async def test_upload_for_missing_file_is_skipped(deps):
    deps.exists.return_value = False
    assert await handlers._index_upload(events_pb2.FileUploaded(file_id="f1", user_id="u1")) is False
    deps.media.index_upload.assert_not_called()


async def test_retry_then_final_failure_reports_failed(deps):
    deps.media.index_upload.side_effect = RuntimeError("boom")
    with patch.object(handlers.settings, "max_processing_retries", 2):
        assert await handlers._index_upload(events_pb2.FileUploaded(file_id="f1", user_id="u1")) is False

    retry, failed = [c.kwargs for c in deps.report.call_args_list]
    assert (retry["status"], retry["retry_count"]) == (common_pb2.PROCESSING_STATUS_IN_PROGRESS, 1)
    assert failed["status"] == common_pb2.PROCESSING_STATUS_FAILED
    assert failed["stage"] == common_pb2.PROCESSING_STAGE_EMBEDDING
    assert failed["error"] == "boom"


async def test_scenes_wait_for_transcription_and_skip_when_it_failed(deps):
    failed = asyncio.get_running_loop().create_future()
    failed.set_result(False)
    handlers._transcriptions["f1"] = failed
    detected = events_pb2.FileScenesDetected(file_id="f1", user_id="u1", scene_count=2)
    assert await handlers._index_scenes(detected) is False
    deps.scenes.index_scenes.assert_not_called()


async def test_scenes_skip_files_that_already_failed(deps):
    deps.get_file.return_value = files_pb2.File(
        id="f1", user_id="u1", processing_status=common_pb2.PROCESSING_STATUS_FAILED
    )
    assert await handlers._index_scenes(events_pb2.FileScenesDetected(file_id="f1", user_id="u1")) is False
    deps.scenes.index_scenes.assert_not_called()


async def test_scenes_are_indexed(deps):
    assert await handlers._index_scenes(events_pb2.FileScenesDetected(file_id="f1", user_id="u1")) is True
    file, scenes = deps.scenes.index_scenes.await_args.args
    assert file.id == "f1" and scenes == []


async def test_file_deleted_cancels_work_and_purges(deps):
    with patch.object(handlers, "file_tasks") as tasks, patch.object(handlers, "DEFERRED_PURGE_SECONDS", 0):
        await handlers.handle_event(_envelope(file_deleted=events_pb2.FileDeleted(file_id="f1", user_id="u1")))
        tasks.cancel.assert_called_once_with("f1")
    assert handlers.is_deleted("f1", "u1")
    where = deps.chroma.text_collection.delete.call_args.kwargs["where"]
    assert where == {"file_id": {"$in": ["f1"]}}


async def test_user_deleted_purges_embeddings(deps):
    await handlers.handle_event(_envelope(user_deleted=events_pb2.UserDeleted(user_id="u9")))
    assert deps.chroma.image_collection.delete.call_args.kwargs["where"] == {"user_id": "u9"}
    assert handlers.is_deleted("any-file", "u9")

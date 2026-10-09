from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src import handlers


def _envelope(**payload) -> events_pb2.Envelope:
    return events_pb2.Envelope(id="evt-1", **payload)


@pytest.fixture
def deps():
    with (
        patch.object(handlers, "scene_repository") as repository,
        patch.object(handlers, "background_task_manager") as tasks,
        patch.object(handlers, "file_exists", new_callable=AsyncMock) as exists,
        patch.object(handlers, "SceneProcessor") as processor_cls,
        patch.object(handlers, "report_stage", new_callable=AsyncMock) as report,
        patch.object(handlers.asyncio, "sleep", new_callable=AsyncMock),
    ):
        repository.delete_for_files = AsyncMock(return_value=4)
        repository.delete_for_user = AsyncMock(return_value=9)
        tasks.create_task = MagicMock(side_effect=lambda coro, **_: coro.close())
        exists.return_value = True
        processor_cls.return_value.process = AsyncMock()
        yield repository, tasks, exists, processor_cls.return_value, report


async def test_file_deleted_cancels_work_and_purges_scenes(deps):
    repository, tasks, *_ = deps
    await handlers.handle_event(_envelope(file_deleted=events_pb2.FileDeleted(file_id="f1", user_id="u1")))
    tasks.cancel_file_tasks.assert_called_once_with("f1")
    repository.delete_for_files.assert_awaited_once_with(["f1"])


async def test_user_deleted_purges_all_scenes(deps):
    repository, *_ = deps
    await handlers.handle_event(_envelope(user_deleted=events_pb2.UserDeleted(user_id="u1")))
    repository.delete_for_user.assert_awaited_once_with("u1")


async def test_file_uploaded_runs_in_background(deps):
    _, tasks, *_ = deps
    upload = events_pb2.FileUploaded(file_id="f1", user_id="u1", type=common_pb2.FILE_TYPE_VIDEO)
    await handlers.handle_event(_envelope(file_uploaded=upload))
    assert tasks.create_task.call_args.kwargs["file_id"] == "f1"


async def test_process_skips_deleted_files(deps):
    _, _, exists, processor, _ = deps
    exists.return_value = False
    await handlers._process(events_pb2.FileUploaded(file_id="f1", user_id="u1"))
    processor.process.assert_not_called()


async def test_process_retries_and_reports_retry_count(deps):
    _, _, _, processor, report = deps
    processor.process.side_effect = [RuntimeError("flaky"), None]
    with patch.object(handlers.settings, "max_processing_retries", 2):
        await handlers._process(events_pb2.FileUploaded(file_id="f1", user_id="u1"))

    assert processor.process.await_count == 2
    assert processor.process.call_args_list[1].kwargs["is_final_attempt"] is True
    assert report.call_args.kwargs["retry_count"] == 1

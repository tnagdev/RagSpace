from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from ragspace.scenes.v1 import scenes_pb2
from ragspace_shared.rpc import RpcError

from src.rpc import scene_servicer as module
from src.rpc.scene_servicer import SceneServicer


def _scene(number: int, key: str | None = "thumbs/s.jpg"):
    return SimpleNamespace(
        id=f"scene-{number}",
        fileId="file-1",
        userId="user-1",
        sceneNumber=number,
        startTime=number * 5.0,
        endTime=number * 5.0 + 5,
        startFrame=0,
        endFrame=150,
        keyframe=75,
        duration=5.0,
        thumbnailS3Key=key,
        metadata={"objects": ["dog"]},
        createdAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


@pytest.fixture
def repo():
    with patch.object(module, "scene_repository") as repository, patch.object(module, "S3Service") as s3_cls:
        repository.list_scenes = AsyncMock(return_value=([_scene(1), _scene(2, key=None)], "next"))
        repository.batch_get = AsyncMock(return_value=[_scene(3)])
        s3_cls.return_value.get_signed_urls = AsyncMock(return_value={"thumbs/s.jpg": "https://signed"})
        yield repository, s3_cls.return_value


async def test_list_scenes_passes_bounds_and_maps_rows(repo):
    repository, s3 = repo
    request = scenes_pb2.ListScenesRequest(user_id="user-1", file_ids=["file-1"], page_size=2, include_urls=True)
    request.start_seconds.min = 4.0
    request.end_seconds.max = 30.0

    response = await SceneServicer().ListScenes(request, None)

    args = repository.list_scenes.call_args.args
    assert args[:3] == ("user-1", ["file-1"], {"start_min": 4.0, "end_max": 30.0})
    assert response.next_page_token == "next"
    assert [s.scene_number for s in response.scenes] == [1, 2]
    assert response.scenes[0].thumbnail_url == "https://signed"
    assert not response.scenes[1].HasField("thumbnail_url")
    assert response.scenes[0].attributes["objects"] == ["dog"]


async def test_list_scenes_skips_signing_without_include_urls(repo):
    _, s3 = repo
    await SceneServicer().ListScenes(scenes_pb2.ListScenesRequest(user_id="user-1"), None)
    s3.get_signed_urls.assert_not_called()


async def test_list_scenes_rejects_too_many_file_ids(repo):
    request = scenes_pb2.ListScenesRequest(user_id="user-1", file_ids=[f"f{i}" for i in range(101)])
    with pytest.raises(RpcError) as error:
        await SceneServicer().ListScenes(request, None)
    assert error.value.reason == "validation_failed"


async def test_batch_get_scopes_to_user(repo):
    repository, _ = repo
    response = await SceneServicer().BatchGetScenes(
        scenes_pb2.BatchGetScenesRequest(user_id="user-1", scene_ids=["scene-3"]), None
    )
    repository.batch_get.assert_awaited_once_with("user-1", ["scene-3"])
    assert response.scenes[0].id == "scene-3"

from unittest.mock import AsyncMock, patch

import pytest
from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.scenes.v1 import scenes_pb2
from ragspace.search.v1 import search_pb2
from ragspace_shared.rpc import RpcError

from src.rpc.search_servicer import SearchServicer
from src.services import search_service as module
from src.services.search_service import SearchOptions

VIDEO = files_pb2.File(
    id="v1", name="Trip", type=common_pb2.FILE_TYPE_YOUTUBE_VIDEO, download_url="https://dl/v1", youtube_url="https://yt/x"
)
IMAGE = files_pb2.File(id="i1", name="Dog", type=common_pb2.FILE_TYPE_IMAGE, thumbnail_url="https://thumb/i1")


async def _inline(fn, *args):
    return fn(*args)


@pytest.fixture
def deps():
    results = [
        {"file_id": "v1", "scene_index": 0, "scene_id": "s1", "start_time": 0.0, "end_time": 5.0,
         "transcript": "hello", "text": "desc | hello", "score": 0.9, "text_score": 0.8, "image_score": 0.7,
         "description_summary": "A beach", "visual_objects": '["sand"]'},
        {"file_id": "v1", "segment_index": 3, "start_time": 6.0, "end_time": 8.0, "text": "spoken", "score": 0.5},
        {"file_id": "i1", "text": "STOP", "score": 0.4},
        {"file_id": "gone", "text": "deleted file", "score": 0.3},
    ]
    with (
        patch.object(module, "run_cpu", side_effect=_inline),
        patch.object(module, "_retrieve", return_value=results) as retrieve,
        patch.object(module, "batch_get_files", AsyncMock(return_value={"v1": VIDEO, "i1": IMAGE})),
        patch.object(module, "batch_get_scenes", AsyncMock(return_value={
            "s1": scenes_pb2.Scene(id="s1", scene_number=1, thumbnail_url="https://thumb/s1")
        })),
        patch.object(module, "scene_at", AsyncMock(return_value=scenes_pb2.Scene(id="s2", scene_number=2))) as scene_at,
    ):
        yield retrieve, scene_at


def test_where_always_scopes_to_user():
    assert module._where("u1", [], []) == {"user_id": "u1"}
    assert module._where("u1", ["f1"], ["VIDEO"]) == {
        "$and": [{"user_id": "u1"}, {"file_id": {"$in": ["f1"]}}, {"file_type": {"$in": ["VIDEO"]}}]
    }


async def test_hits_are_enriched_and_missing_files_dropped(deps):
    _, scene_at = deps
    hits = await module.search("u1", "beach", [], [], SearchOptions())

    assert [h.file_id for h in hits] == ["v1", "v1", "i1"]
    scene, audio, image = hits
    assert (scene.scene_id, scene.scene_number, scene.snippet) == ("s1", 1, "hello")
    assert scene.thumbnail_url == "https://thumb/s1" and scene.youtube_url == "https://yt/x"
    assert scene.visual.summary == "A beach" and list(scene.visual.objects) == ["sand"]
    assert (audio.scene_id, audio.segment_index, audio.snippet) == ("s2", 3, "spoken")
    assert scene_at.await_args.args == ("u1", "v1", 7.0)
    assert image.thumbnail_url == "https://thumb/i1" and not image.HasField("scene_id")


async def test_type_filter_distinguishes_youtube_from_uploads(deps):
    retrieve, _ = deps
    hits = await module.search("u1", "beach", [], [common_pb2.FILE_TYPE_VIDEO], SearchOptions())
    assert hits == []
    assert retrieve.call_args.args[1] == {"$and": [{"user_id": "u1"}, {"file_type": {"$in": ["VIDEO"]}}]}


async def test_unindexed_types_short_circuit(deps):
    retrieve, _ = deps
    assert await module.search("u1", "q", [], [common_pb2.FILE_TYPE_DOCUMENT], SearchOptions()) == []
    retrieve.assert_not_called()


async def test_servicer_validates_and_clamps():
    with patch.object(module, "search", AsyncMock(return_value=[])) as search:
        servicer = SearchServicer()
        with pytest.raises(RpcError):
            await servicer.Search(search_pb2.SearchRequest(user_id="u1", query="  "), None)
        bad = search_pb2.SearchRequest(user_id="u1", query="q")
        bad.tuning.threshold = 2.0
        with pytest.raises(RpcError):
            await servicer.Search(bad, None)

        request = search_pb2.SearchRequest(user_id="u1", query=" q ", limit=500)
        request.tuning.query_expansion = False
        await servicer.Search(request, None)
        _, query, _, _, options = search.await_args.args
        assert query == "q" and options.limit == 50 and options.query_expansion is False

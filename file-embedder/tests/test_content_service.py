from unittest.mock import AsyncMock, patch

import pytest
from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.scenes.v1 import scenes_pb2
from ragspace.search.v1 import search_pb2
from ragspace_shared.protos import to_struct
from ragspace_shared.rpc import RpcError

from src.services import content_service as module


async def _inline(fn, *args):
    return fn(*args)


@pytest.fixture(autouse=True)
def inline_cpu():
    with patch.object(module, "run_cpu", side_effect=_inline):
        yield


def _video() -> files_pb2.File:
    return files_pb2.File(
        id="v1",
        user_id="u1",
        name="Trip",
        type=common_pb2.FILE_TYPE_VIDEO,
        mime_type="video/mp4",
        download_url="https://dl/v1",
        attributes=to_struct({"durationSeconds": 12}),
    )


async def test_video_content_merges_scenes_and_transcript(chroma):
    chroma.text_collection.get.side_effect = [
        {
            "ids": ["a"],
            "metadatas": [{"segment_index": 0, "start_time": 1.0, "end_time": 4.0}],
            "documents": ["hello there"],
        },
        {"ids": [], "metadatas": [], "documents": []},
    ]
    chroma.image_collection.get.return_value = {
        "ids": ["s"],
        "metadatas": [{"scene_index": 0, "scene_number": 1, "start_time": 0.0, "end_time": 5.0,
                       "description_summary": "A beach", "visual_setting": "coast"}],
        "documents": ["A beach | hello there"],
    }
    scene = scenes_pb2.Scene(id="s1", scene_number=1, thumbnail_url="https://thumb/s1")
    with (
        patch.object(module, "get_file", AsyncMock(return_value=_video())),
        patch.object(module, "list_scenes", AsyncMock(return_value=[scene])),
    ):
        content = await module.get_file_content("u1", "v1", include_visual=True)

    kinds = [s.kind for s in content.segments]
    assert kinds == [search_pb2.SEGMENT_KIND_VISUAL, search_pb2.SEGMENT_KIND_AUDIO]
    visual = content.segments[0]
    assert (visual.scene_id, visual.thumbnail_url, visual.visual.setting) == ("s1", "https://thumb/s1", "coast")
    assert content.transcript == "hello there"
    assert content.duration_seconds == 12
    assert content.file_url == "https://dl/v1"
    assert "[Visual] A beach | Setting: coast" in content.summary_context
    assert '[Audio] "hello there"' in content.summary_context


async def test_image_content_returns_visual_and_ocr(chroma):
    chroma.image_collection.get.return_value = {
        "ids": ["i1#image#0"],
        "metadatas": [{"description_summary": "A dog", "visual_colors": '["brown"]', "ocr_text": "GOOD BOY"}],
        "documents": ["A dog | GOOD BOY"],
    }
    image = files_pb2.File(id="i1", user_id="u1", name="Dog", type=common_pb2.FILE_TYPE_IMAGE)
    with patch.object(module, "get_file", AsyncMock(return_value=image)):
        content = await module.get_file_content("u1", "i1", include_visual=True)

    assert content.visual.summary == "A dog" and list(content.visual.colors) == ["brown"]
    assert not content.segments
    assert "Text in image: GOOD BOY" in content.summary_context


async def test_visual_metadata_is_optional(chroma):
    chroma.image_collection.get.return_value = {
        "ids": ["i1#image#0"], "metadatas": [{"description_summary": "A dog"}], "documents": [""]
    }
    image = files_pb2.File(id="i1", user_id="u1", name="Dog", type=common_pb2.FILE_TYPE_IMAGE)
    with patch.object(module, "get_file", AsyncMock(return_value=image)):
        content = await module.get_file_content("u1", "i1", include_visual=False)
    assert not content.HasField("visual")


async def test_missing_file_is_not_found(chroma):
    with patch.object(module, "get_file", AsyncMock(return_value=None)):
        with pytest.raises(RpcError) as error:
            await module.get_file_content("u1", "nope", include_visual=True)
    assert error.value.reason == "not_found"

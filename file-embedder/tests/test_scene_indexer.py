from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.scenes.v1 import scenes_pb2

from src.services import scene_indexer as module

FILE = files_pb2.File(id="file-1", user_id="user-1", name="clip.mp4", type=common_pb2.FILE_TYPE_VIDEO)


def _scenes(count: int) -> list[scenes_pb2.Scene]:
    return [
        scenes_pb2.Scene(
            id=f"scene-{n}",
            file_id="file-1",
            scene_number=n,
            start_seconds=(n - 1) * 5.0,
            end_seconds=n * 5.0,
            thumbnail_key=f"thumbs/{n}.jpg",
        )
        for n in range(1, count + 1)
    ]


async def _inline(fn, *args):
    return fn(*args)


@pytest.fixture
def deps(chroma, tmp_path):
    embedder = MagicMock()
    embedder.embed_image.return_value = np.ones(4)
    embedder.embed_text.return_value = np.ones(4)
    embedder.extract_text.return_value = ""
    chroma.text_collection.get.return_value = {
        "ids": ["a"],
        "metadatas": [{"segment_index": 0, "start_time": 4.0, "end_time": 6.0}],
        "documents": ["across the cut"],
    }
    report = AsyncMock()
    with (
        patch.object(module, "VideoEmbedderService", return_value=embedder),
        patch.object(module, "S3ClientService") as s3_cls,
        patch.object(module, "report_stage", report),
        patch("src.events.report_stage", report),
        patch.object(module, "run_cpu", side_effect=_inline),
        patch.object(module.settings, "temp_dir", str(tmp_path)),
        patch.object(module.settings, "nvidia_api_key", None),
        patch.object(module, "SCENE_RETRY_DELAYS", [0]),
    ):
        s3_cls.return_value.download = AsyncMock(side_effect=lambda bucket, key, path: path)
        yield SimpleNamespace(embedder=embedder, report=report, chroma=chroma, s3=s3_cls.return_value)


def test_match_transcript_includes_every_overlap():
    segments = [
        {"start_time": 0.0, "end_time": 2.0, "text": "one"},
        {"start_time": 4.0, "end_time": 6.0, "text": "two"},
        {"start_time": 9.0, "end_time": 12.0, "text": "three"},
    ]
    assert module.match_transcript(5.0, 10.0, segments) == "two three"
    assert module.match_transcript(20.0, 25.0, segments) is None


async def test_indexes_scenes_with_ids_and_transcripts(deps):
    await module.index_scenes(FILE, _scenes(2))

    visual = deps.chroma.image_collection.upsert.call_args.kwargs
    assert visual["ids"] == ["file-1#scene_0", "file-1#scene_1"]
    assert [m["scene_id"] for m in visual["metadatas"]] == ["scene-1", "scene-2"]
    assert [m["transcript"] for m in visual["metadatas"]] == ["across the cut", "across the cut"]
    assert deps.chroma.text_collection.upsert.call_args.kwargs["ids"] == ["file-1#scene_0#text", "file-1#scene_1#text"]

    final = deps.report.call_args_list[-1].kwargs
    assert final["stage"] == common_pb2.PROCESSING_STAGE_COMPLETED
    assert final["attributes"] == {"scenesIndexed": 2}


async def test_reindexing_clears_previous_scene_embeddings(deps):
    await module.index_scenes(FILE, _scenes(1))
    deleted = [c.kwargs.get("where") for c in deps.chroma.image_collection.delete.call_args_list]
    assert {"$and": [{"file_id": "file-1"}, {"scene_index": {"$gte": 0}}]} in deleted


async def test_no_scenes_completes(deps):
    await module.index_scenes(FILE, [])
    assert deps.report.call_args.kwargs["attributes"] == {"scenesIndexed": 0}
    deps.chroma.image_collection.upsert.assert_not_called()


async def test_too_many_failed_scenes_aborts(deps):
    deps.s3.download.side_effect = OSError("network down")
    with pytest.raises(RuntimeError, match="aborted"):
        await module.index_scenes(FILE, _scenes(3))
    deps.chroma.image_collection.upsert.assert_not_called()


async def test_all_descriptions_failing_is_an_error(deps):
    with (
        patch.object(module.settings, "nvidia_api_key", "key"),
        patch.object(module, "describe_image", AsyncMock(side_effect=RuntimeError("503"))),
        patch.object(module, "LLMService"),
    ):
        with pytest.raises(RuntimeError, match="Vision model unavailable"):
            await module.index_scenes(FILE, _scenes(2))

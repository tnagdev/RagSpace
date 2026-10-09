from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import grpc
import pytest
from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.search.v1 import search_pb2
from ragspace_shared.protos import to_struct

from src.graph import formatters, orchestrator
from src.graph.nodes import fetch_context, file_content, intent_classifier, response_synthesizer, video_search
from tests.conftest import state

VIDEO = common_pb2.FILE_TYPE_VIDEO
IMAGE = common_pb2.FILE_TYPE_IMAGE


class _RpcError(grpc.aio.AioRpcError):
    def __init__(self, code: grpc.StatusCode):
        super().__init__(code, grpc.aio.Metadata(), grpc.aio.Metadata(), details="boom")


def _search_stub(**methods) -> MagicMock:
    client = MagicMock()
    client.opts.return_value = {}
    for name, value in methods.items():
        setattr(client.stub, name, value)
    return client


def _video_content() -> search_pb2.GetFileContentResponse:
    return search_pb2.GetFileContentResponse(
        file_id="v1",
        file_name="Trip",
        file_type=VIDEO,
        duration_seconds=12.0,
        summary_context="timeline",
        character_registry=to_struct({"characters": [{"name": "Ana", "role": "lead"}], "story_context": "a trip"}),
        segments=[
            search_pb2.ContentSegment(
                kind=search_pb2.SEGMENT_KIND_VISUAL,
                start_seconds=0.0,
                end_seconds=5.0,
                visual={"summary": "A beach"},
            ),
            search_pb2.ContentSegment(kind=search_pb2.SEGMENT_KIND_AUDIO, start_seconds=1.0, end_seconds=3.0, text="hi"),
            search_pb2.ContentSegment(kind=search_pb2.SEGMENT_KIND_AUDIO, start_seconds=9.0, end_seconds=10.0, text="bye"),
        ],
    )


def test_search_results_format_dialogue_and_visuals():
    hit = common_pb2.SearchHit(file_name="Trip", segment_index=2, start_seconds=1.0, end_seconds=2.5, snippet="hello")
    scene = common_pb2.SearchHit(file_name="Trip", start_seconds=0.0, visual={"summary": "A beach", "objects": ["sand"]})
    formatted = formatters.format_search_results_for_llm([hit, scene])
    first, second = formatted["results"]
    assert first == {"file_name": "Trip", "source": "spoken_dialogue", "time_range": "1.0s - 2.5s", "dialogue": "hello"}
    assert second["source"] == "visual_scene" and second["objects_on_screen"] == ["sand"]
    assert formatters.format_search_results_for_llm([])["found"] is False


def test_video_content_merges_dialogue_into_scenes():
    formatted = formatters.format_video_content_for_llm(_video_content())
    assert formatted["timeline"] == [{"time_range": "0.0s - 5.0s", "scene": "A beach", "dialogue": "hi"}]
    assert formatted["additional_audio"] == ['[9.0s] "bye"']
    assert formatted["characters"][0]["name"] == "Ana" and formatted["story_context"] == "a trip"
    assert formatted["duration_formatted"] == "0.2 minutes"


def test_routing_rules():
    route = orchestrator._route_after_intent
    assert route(state(intent="converse", file_ids=["a"])) == "synthesize"
    assert route(state(intent="summarize", file_ids=[])) == "video_search"
    assert route(state(intent="summarize", file_ids=["a"])) == "content_dispatch"
    assert route(state(intent="search", file_ids=["a"])) == "video_search"
    assert route(state(intent="search", file_ids=["a", "b"])) == "content_dispatch"
    assert route(state(intent="summarize", file_ids=[str(i) for i in range(6)])) == "video_search"


async def test_content_dispatch_splits_by_type_and_merges():
    attached = [files_pb2.File(id="v", type=VIDEO), files_pb2.File(id="i", type=IMAGE)]
    video = AsyncMock(return_value={"retrieved_context": "V", "search_results": [], "tools_used": ["a"], "events": [1]})
    image = AsyncMock(return_value={"retrieved_context": "I", "search_results": [], "tools_used": ["b"], "events": [2]})
    with patch.object(orchestrator, "video_content_node", video), patch.object(orchestrator, "image_content_node", image):
        merged = await orchestrator.content_dispatch_node(state(file_ids=["v", "i"], attached_files=attached), {})
    assert video.await_args.args[0]["file_ids"] == ["v"] and image.await_args.args[0]["file_ids"] == ["i"]
    assert merged["retrieved_context"] == "V\n\nI" and merged["tools_used"] == ["a", "b"] and merged["events"] == [1, 2]


async def test_fetch_context_loads_attachments_in_order():
    files = {"b": files_pb2.File(id="b"), "a": files_pb2.File(id="a")}
    with patch.object(fetch_context, "batch_get_files", AsyncMock(return_value=files)):
        update = await fetch_context.fetch_context_node(state(file_ids=["a", "b", "gone"]), {})
    assert [f.id for f in update["attached_files"]] == ["a", "b"]


async def test_intent_classifier_falls_back_to_search():
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=SimpleNamespace(content="not json"))
    with patch.object(intent_classifier, "LangChainLLMClient") as factory:
        factory.return_value.get.return_value = llm
        update = await intent_classifier.intent_classifier_node(state(), {})
    assert update["intent"] == "search" and update["query_modality"] == "both"
    assert any(e["status"] == "failed" for e in update["events"])


async def test_video_search_applies_modality_weights_and_trims():
    hits = [common_pb2.SearchHit(file_id="f", start_seconds=float(i)) for i in range(12, 0, -1)]
    search = AsyncMock(return_value=search_pb2.SearchResponse(hits=hits))
    with patch.object(video_search, "search_client", return_value=_search_stub(Search=search)):
        update = await video_search.video_search_node(state(query_modality="visual", file_ids=["f"]), {})

    request = search.await_args.args[0]
    assert (request.tuning.text_weight, request.tuning.image_weight, request.limit) == (0.25, 0.75, 15)
    assert len(update["search_results"]) == 8
    assert [h.start_seconds for h in update["search_results"]] == sorted(h.start_seconds for h in update["search_results"])
    assert update["tools_used"] == ["search_files"]
    assert any(e["type"] == "results" for e in update["events"])


async def test_video_search_degrades_on_timeout():
    search = AsyncMock(side_effect=_RpcError(grpc.StatusCode.DEADLINE_EXCEEDED))
    with patch.object(video_search, "search_client", return_value=_search_stub(Search=search)):
        update = await video_search.video_search_node(state(), {})
    assert update["search_results"] == []
    failed = next(e for e in update["events"] if e.get("status") == "failed")
    assert failed["error_code"] == "TIMEOUT"


async def test_image_content_builds_preview_hits():
    content = search_pb2.GetFileContentResponse(
        file_id="i1", file_name="Dog", file_type=IMAGE, thumbnail_url="https://t", visual={"summary": "A dog"}
    )
    stub = _search_stub(GetFileContent=AsyncMock(return_value=content))
    with patch.object(file_content, "search_client", return_value=stub):
        update = await file_content.image_content_node(state(file_ids=["i1"]), {})
    hit = update["search_results"][0]
    assert (hit.file_id, hit.thumbnail_url, hit.visual.summary) == ("i1", "https://t", "A dog")
    assert '"description": "A dog"' in update["retrieved_context"]


async def test_video_content_skips_unreadable_files():
    stub = _search_stub(
        GetFileContent=AsyncMock(side_effect=[_video_content(), _RpcError(grpc.StatusCode.NOT_FOUND)]),
        Search=AsyncMock(return_value=search_pb2.SearchResponse(hits=[common_pb2.SearchHit(file_id="v1")])),
    )
    with patch.object(file_content, "search_client", return_value=stub):
        update = await file_content.video_content_node(state(file_ids=["v1", "v2"]), {})
    assert update["retrieved_context"].count('"file_id": "v1"') == 1
    assert len(update["search_results"]) == 1
    assert update["tools_used"] == ["get_video_content"]


def test_system_prompt_adds_instructions_for_what_is_discussed():
    prompt = response_synthesizer.build_system_prompt(
        state(
            intent="summarize",
            attached_files=[files_pb2.File(name="beach.jpg", type=IMAGE)],
            search_results=[common_pb2.SearchHit(file_type=VIDEO)],
            retrieved_context="CONTEXT",
            conversation_summary="EARLIER",
        )
    )
    assert response_synthesizer._VIDEO_INSTRUCTIONS in prompt
    assert response_synthesizer._SUMMARIZE_INSTRUCTIONS in prompt
    assert response_synthesizer._IMAGE_INSTRUCTIONS in prompt
    assert "### Attached image(s): beach.jpg" in prompt
    assert "CONTEXT" in prompt and "EARLIER" in prompt


@pytest.mark.parametrize("error_text, expected", [("429 rate_limit", response_synthesizer.AT_CAPACITY)])
async def test_synthesizer_falls_back_after_rate_limits(error_text, expected):
    import openai

    error = openai.APIError(error_text, request=MagicMock(), body=None)

    async def failing_stream(_messages):
        raise error
        yield

    llm = MagicMock()
    llm.astream = failing_stream
    with (
        patch.object(response_synthesizer, "LangChainLLMClient") as factory,
        patch.object(response_synthesizer.asyncio, "sleep", AsyncMock()),
    ):
        factory.return_value.get.return_value = llm
        update = await response_synthesizer.response_synthesizer_node(state(), {})
    assert update["final_response"] == expected

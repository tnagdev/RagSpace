from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from ragspace.chat.v1 import chat_pb2
from ragspace.common.v1 import common_pb2
from ragspace_shared.rpc import RpcError

from src.graph.events import results, step_done
from src.services import chat_runner as runner
from tests.conftest import NOW, conversation, message


def _request(**fields) -> chat_pb2.SendMessageRequest:
    return chat_pb2.SendMessageRequest(user_id="user-1", conversation_id="conv-1", content="find the beach", **fields)


class _FakeGraph:
    def __init__(self, chunks, updates, error=None):
        self.chunks, self.updates, self.error = chunks, updates, error

    async def astream(self, state, stream_mode):
        self.state = state
        for text in self.chunks:
            yield "messages", (SimpleNamespace(content=text), {"langgraph_node": "synthesize"})
        if self.error:
            raise self.error
        for update in self.updates:
            yield "updates", update


@pytest.fixture
def store():
    with patch.object(runner, "store") as store:
        store.get_conversation = AsyncMock(return_value=conversation())
        store.find_request = AsyncMock(return_value=(None, None))
        store.add_user_message = AsyncMock(return_value=message(id="q1"))
        store.history = AsyncMock(return_value=[message(id="q1", content="find the beach")])
        store.add_assistant_message = AsyncMock(return_value=message(id="a1", role="assistant"))
        store.save_summary = AsyncMock()
        yield store


async def _collect(request):
    return [event async for event in runner.send_message(request)]


async def test_streams_graph_events_and_persists_reply(store):
    hit = common_pb2.SearchHit(file_id="f1", thumbnail_url="https://signed")
    graph = _FakeGraph(
        ["The beach ", "is at 0:05."],
        [
            {"video_search": {"tools_used": ["search_files"], "events": [results("search", [hit])]}},
            {"synthesize": {"final_response": "The beach is at 0:05.", "events": [step_done("synthesizer", "ok")]}},
        ],
    )
    with patch.object(runner, "graph", graph):
        events = await _collect(_request())

    kinds = [e.WhichOneof("event") for e in events]
    assert kinds == ["step", "delta", "delta", "results", "step", "done"]
    assert events[-1].done.message_id == "a1" and list(events[-1].done.tools_used) == ["search_files"]
    _, _, content, stored_hits, file_ids, tools = store.add_assistant_message.await_args.args
    assert content == "The beach is at 0:05."
    assert stored_hits == [{"file_id": "f1"}]
    assert graph.state["conversation_history"] == [{"role": "user", "content": "find the beach"}]


async def test_unstreamed_fallback_reply_is_sent_as_a_delta(store):
    graph = _FakeGraph([], [{"synthesize": {"final_response": "At capacity", "events": []}}])
    with patch.object(runner, "graph", graph):
        events = await _collect(_request())
    assert [e.delta.text for e in events if e.HasField("delta")] == ["At capacity"]


async def test_graph_failure_ends_with_error_event(store):
    with patch.object(runner, "graph", _FakeGraph(["partial"], [], error=RuntimeError("model down"))):
        events = await _collect(_request())
    assert events[-1].error.code == "model_error"
    store.add_assistant_message.assert_not_called()


async def test_replay_streams_stored_reply_without_running_the_model(store):
    stored = message(id="a9", role="assistant", content="Stored answer", toolsUsed=["search_files"],
                     searchResults=[{"file_id": "f1", "file_name": "Trip"}])
    store.find_request = AsyncMock(return_value=(message(id="q9"), stored))
    with patch.object(runner.hit_store, "hydrate", AsyncMock()), patch.object(runner, "graph") as graph:
        events = await _collect(_request(request_id="req-1"))
    graph.astream.assert_not_called()
    assert [e.WhichOneof("event") for e in events] == ["results", "delta", "done"]
    assert events[1].delta.text == "Stored answer" and events[2].done.message_id == "a9"


async def test_retry_after_crash_reuses_the_stored_question(store):
    store.find_request = AsyncMock(return_value=(message(id="q7"), None))
    with patch.object(runner, "graph", _FakeGraph([], [{"synthesize": {"final_response": "ok", "events": []}}])):
        await _collect(_request(request_id="req-1"))
    store.add_user_message.assert_not_called()
    assert store.add_assistant_message.await_args.args[1].id == "q7"


async def test_scope_defaults_to_the_conversation(store):
    store.get_conversation = AsyncMock(return_value=conversation(collectionId="col-1"))
    with (
        patch.object(runner, "resolve_collection_file_ids", AsyncMock(return_value=["a", "b"])),
        patch.object(runner, "graph", _FakeGraph([], [{"synthesize": {"final_response": "ok", "events": []}}])) as graph,
    ):
        await _collect(_request())
    assert graph.state["file_ids"] == ["a", "b"]


async def test_long_history_is_folded_into_the_summary(store):
    history = [message(id=f"m{i}", content=f"turn {i}", timestamp=NOW + timedelta(seconds=i)) for i in range(25)]
    store.history = AsyncMock(return_value=history)
    with (
        patch.object(runner, "SummaryService") as summary,
        patch.object(runner, "graph", _FakeGraph([], [{"synthesize": {"final_response": "ok", "events": []}}])) as graph,
    ):
        summary.return_value.summarize = AsyncMock(return_value="SUMMARY")
        await _collect(_request())

    folded, _ = summary.return_value.summarize.await_args.args
    assert len(folded) == 15
    store.save_summary.assert_awaited_once_with("conv-1", "SUMMARY", history[14].timestamp)
    assert graph.state["conversation_summary"] == "SUMMARY" and len(graph.state["conversation_history"]) == 10


@pytest.mark.parametrize("request_fields, reason", [({"content": "  "}, "validation_failed"), ({}, "not_found")])
async def test_errors_before_streaming_are_rpc_errors(store, request_fields, reason):
    store.get_conversation = AsyncMock(return_value=None)
    request = _request()
    request.MergeFrom(chat_pb2.SendMessageRequest(**request_fields))
    if "content" in request_fields:
        request.content = request_fields["content"]
    with pytest.raises(RpcError) as error:
        await _collect(request)
    assert error.value.reason == reason

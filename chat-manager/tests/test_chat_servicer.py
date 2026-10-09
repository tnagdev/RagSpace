from unittest.mock import AsyncMock, patch

import pytest
from ragspace.chat.v1 import chat_pb2
from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2
from ragspace.files.v1 import files_pb2
from ragspace.scenes.v1 import scenes_pb2
from ragspace_shared.rpc import RpcError

from src import handlers, hits
from src.rpc import chat_servicer as module
from src.rpc.chat_servicer import ChatServicer
from tests.conftest import conversation, message


@pytest.fixture
def deps():
    with (
        patch.object(module, "store") as store,
        patch.object(module, "quota") as quota,
        patch.object(module, "_assert_scope_exists", AsyncMock()),
    ):
        quota.metric_for.side_effect = lambda f, c: (
            common_pb2.USAGE_METRIC_FILE_CONVERSATIONS if f or c else common_pb2.USAGE_METRIC_CONVERSATIONS
        )
        quota.consume = AsyncMock()
        quota.release = AsyncMock()
        store.find_by_request = AsyncMock(return_value=None)
        store.create_conversation = AsyncMock(side_effect=lambda cid, uid, f, c, r: conversation(id=cid, fileId=f))
        yield store, quota


async def test_create_consumes_the_scoped_quota(deps):
    store, quota = deps
    request = chat_pb2.CreateConversationRequest(user_id="user-1", file_id="f1", request_id="req-1")
    response = await ChatServicer().CreateConversation(request, None)

    user_id, metric, request_id = quota.consume.await_args.args
    assert metric == common_pb2.USAGE_METRIC_FILE_CONVERSATIONS
    assert request_id == "conversation:user-1:req-1"
    assert response.conversation.file_id == "f1"


async def test_create_replay_returns_existing_without_quota(deps):
    store, quota = deps
    store.find_by_request = AsyncMock(return_value=conversation(id="existing"))
    response = await ChatServicer().CreateConversation(
        chat_pb2.CreateConversationRequest(user_id="user-1", request_id="req-1"), None
    )
    assert response.conversation.id == "existing"
    quota.consume.assert_not_called()


async def test_create_rolls_back_quota_when_insert_fails(deps):
    store, quota = deps
    store.create_conversation = AsyncMock(side_effect=RuntimeError("db down"))
    with pytest.raises(RuntimeError):
        await ChatServicer().CreateConversation(chat_pb2.CreateConversationRequest(user_id="user-1"), None)
    assert quota.release.await_args.args[1] == common_pb2.USAGE_METRIC_CONVERSATIONS


async def test_create_rejects_double_scope(deps):
    with pytest.raises(RpcError):
        await ChatServicer().CreateConversation(
            chat_pb2.CreateConversationRequest(user_id="u", file_id="f", collection_id="c"), None
        )


async def test_delete_releases_quota(deps):
    store, quota = deps
    store.delete_conversation = AsyncMock(return_value=conversation(id="c9", collectionId="col"))
    await ChatServicer().DeleteConversation(chat_pb2.DeleteConversationRequest(user_id="user-1", conversation_id="c9"), None)
    assert quota.release.await_args.args == (
        "user-1", common_pb2.USAGE_METRIC_FILE_CONVERSATIONS, 1, "conversation-delete:c9"
    )


async def test_delete_missing_is_not_found(deps):
    store, _ = deps
    store.delete_conversation = AsyncMock(return_value=None)
    with pytest.raises(RpcError) as error:
        await ChatServicer().DeleteConversation(chat_pb2.DeleteConversationRequest(user_id="u", conversation_id="x"), None)
    assert error.value.reason == "not_found"


async def test_list_messages_hydrates_media_urls(deps):
    store, _ = deps
    store.get_conversation = AsyncMock(return_value=conversation())
    stored = [{"file_id": "f1", "scene_id": "s1", "file_name": "Trip"}]
    store.list_messages = AsyncMock(
        return_value=([message(id="a1", role="assistant", searchResults=stored, toolsUsed=["search_files"])], "next")
    )
    files = {"f1": files_pb2.File(id="f1", download_url="https://file")}
    scenes = {"s1": scenes_pb2.Scene(id="s1", thumbnail_url="https://thumb")}
    with (
        patch.object(hits, "batch_get_files", AsyncMock(return_value=files)),
        patch.object(hits, "batch_get_scenes", AsyncMock(return_value=scenes)),
    ):
        response = await ChatServicer().ListMessages(
            chat_pb2.ListMessagesRequest(user_id="user-1", conversation_id="conv-1"), None
        )
    hit = response.messages[0].hits[0]
    assert (hit.file_url, hit.thumbnail_url) == ("https://file", "https://thumb")
    assert response.messages[0].role == chat_pb2.MESSAGE_ROLE_ASSISTANT and response.next_page_token == "next"


def test_stored_hits_drop_urls_and_read_legacy_rows():
    stored = hits.to_stored([common_pb2.SearchHit(file_id="f1", file_url="https://x", thumbnail_url="https://y")])
    assert stored == [{"file_id": "f1"}]
    legacy = hits.from_stored(
        [{"file_id": "f1", "file_name": "Trip", "file_type": "VIDEO", "start_time": 4.5, "text_content": "hi",
          "description": "A beach", "score": 0.7}]
    )[0]
    assert legacy.file_type == common_pb2.FILE_TYPE_VIDEO
    assert (legacy.start_seconds, legacy.snippet, legacy.visual.summary) == (4.5, "hi", "A beach")


async def test_scoped_deletion_releases_before_deleting():
    calls = []
    with patch.object(handlers, "store") as store, patch.object(handlers, "quota") as quota:
        store.scope_filter.return_value = {"where": True}
        store.count_scoped = AsyncMock(side_effect=lambda w: calls.append("count") or 3)
        store.delete_scoped = AsyncMock(side_effect=lambda w: calls.append("delete") or 3)
        quota.release = AsyncMock(side_effect=lambda *a: calls.append("release"))
        envelope = events_pb2.Envelope(id="evt-9", file_deleted=events_pb2.FileDeleted(file_id="f1", user_id="u1"))
        await handlers.handle_event(envelope)

    assert calls == ["count", "release", "delete"]
    assert quota.release.await_args.args == ("u1", common_pb2.USAGE_METRIC_FILE_CONVERSATIONS, 3, "evt-9:conversations")
    store.scope_filter.assert_called_once_with("u1", ["f1"], [])

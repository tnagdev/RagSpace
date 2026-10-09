import logging
import uuid

import grpc
from prisma.errors import UniqueViolationError
from prisma.models import Conversation, Message
from ragspace.chat.v1 import chat_pb2, chat_pb2_grpc
from ragspace.files.v1 import collections_pb2, files_pb2
from ragspace_shared.protos import to_timestamp
from ragspace_shared.rpc import invalid_argument, not_found

from src import hits as hit_store
from src.clients import collections_client, files_client
from src.services import chat_runner, quota
from src.services import conversation_store as store
from src.services.greeting import greeting

logger = logging.getLogger(__name__)

SERVICE_NAME = chat_pb2.DESCRIPTOR.services_by_name["ChatService"].full_name


class ChatServicer(chat_pb2_grpc.ChatServiceServicer):
    async def CreateConversation(self, request: chat_pb2.CreateConversationRequest, context):
        file_id = request.file_id if request.HasField("file_id") else None
        collection_id = request.collection_id if request.HasField("collection_id") else None
        if file_id and collection_id:
            raise invalid_argument("A conversation is scoped to a file or a collection, not both")
        request_id = request.request_id or None
        if request_id:
            existing = await store.find_by_request(request.user_id, request_id)
            if existing is not None:
                return chat_pb2.CreateConversationResponse(conversation=to_conversation(existing))
        await _assert_scope_exists(request.user_id, file_id, collection_id)

        conversation_id = str(uuid.uuid4())
        metric = quota.metric_for(file_id, collection_id)
        await quota.consume(request.user_id, metric, f"conversation:{request.user_id}:{request_id or conversation_id}")
        try:
            conversation = await store.create_conversation(
                conversation_id, request.user_id, file_id, collection_id, request_id
            )
        except UniqueViolationError:
            conversation = await store.find_by_request(request.user_id, request_id or "")
            if conversation is None:
                raise
        except Exception:
            await quota.release(request.user_id, metric, 1, f"conversation-rollback:{conversation_id}")
            raise
        return chat_pb2.CreateConversationResponse(conversation=to_conversation(conversation))

    async def ListConversations(self, request: chat_pb2.ListConversationsRequest, context):
        conversations, token = await store.list_conversations(
            request.user_id,
            request.file_id if request.HasField("file_id") else None,
            request.collection_id if request.HasField("collection_id") else None,
            request.page_size,
            request.page_token,
        )
        return chat_pb2.ListConversationsResponse(
            conversations=[to_conversation(c) for c in conversations], next_page_token=token
        )

    async def GetConversation(self, request: chat_pb2.GetConversationRequest, context):
        conversation = await store.get_conversation(request.user_id, request.conversation_id)
        if conversation is None:
            raise not_found("Conversation")
        return chat_pb2.GetConversationResponse(conversation=to_conversation(conversation))

    async def DeleteConversation(self, request: chat_pb2.DeleteConversationRequest, context):
        conversation = await store.delete_conversation(request.user_id, request.conversation_id)
        if conversation is None:
            raise not_found("Conversation")
        try:
            await quota.release(
                request.user_id,
                quota.metric_for(conversation.fileId, conversation.collectionId),
                1,
                f"conversation-delete:{conversation.id}",
            )
        except grpc.aio.AioRpcError:
            logger.exception("Quota release failed for deleted conversation %s", conversation.id)
        return chat_pb2.DeleteConversationResponse()

    async def ListMessages(self, request: chat_pb2.ListMessagesRequest, context):
        conversation = await store.get_conversation(request.user_id, request.conversation_id)
        if conversation is None:
            raise not_found("Conversation")
        messages, token = await store.list_messages(conversation.id, request.page_size, request.page_token)
        protos = [to_message(m) for m in messages]
        try:
            await hit_store.hydrate(request.user_id, [hit for m in protos for hit in m.hits])
        except grpc.aio.AioRpcError:
            logger.warning("Returning messages without fresh media URLs", exc_info=True)
        return chat_pb2.ListMessagesResponse(messages=protos, next_page_token=token)

    async def SendMessage(self, request: chat_pb2.SendMessageRequest, context):
        async for event in chat_runner.send_message(request):
            yield event

    async def GetGreeting(self, request: chat_pb2.GetGreetingRequest, context):
        return chat_pb2.GetGreetingResponse(greeting=await greeting(request.user_id, request.display_name))


async def _assert_scope_exists(user_id: str, file_id: str | None, collection_id: str | None) -> None:
    try:
        if file_id:
            client = files_client()
            await client.stub.GetFile(files_pb2.GetFileRequest(user_id=user_id, file_id=file_id), **client.opts())
        if collection_id:
            client = collections_client()
            await client.stub.GetCollection(
                collections_pb2.GetCollectionRequest(user_id=user_id, collection_id=collection_id), **client.opts()
            )
    except grpc.aio.AioRpcError as error:
        if error.code() == grpc.StatusCode.NOT_FOUND:
            raise not_found("File" if file_id else "Collection") from error
        raise


def to_conversation(conversation: Conversation) -> chat_pb2.Conversation:
    message = chat_pb2.Conversation(
        id=conversation.id,
        user_id=conversation.userId,
        message_count=conversation.messageCount,
        create_time=to_timestamp(conversation.createdAt),
        update_time=to_timestamp(conversation.updatedAt),
    )
    for field, value in (
        ("title", conversation.title),
        ("file_id", conversation.fileId),
        ("collection_id", conversation.collectionId),
        ("last_message_preview", conversation.lastMessagePreview),
    ):
        if value:
            setattr(message, field, value)
    return message


def to_message(message: Message) -> chat_pb2.Message:
    role = chat_pb2.MESSAGE_ROLE_ASSISTANT if message.role == "assistant" else chat_pb2.MESSAGE_ROLE_USER
    return chat_pb2.Message(
        id=message.id,
        conversation_id=message.conversationId,
        role=role,
        content=message.content,
        hits=hit_store.from_stored(message.searchResults),
        file_ids=message.fileIds or [],
        tools_used=message.toolsUsed or [],
        create_time=to_timestamp(message.timestamp),
    )

from datetime import datetime
from typing import Any

from prisma import Json
from prisma.errors import UniqueViolationError
from prisma.models import Conversation, Message
from ragspace_shared.paging import clamp_page_size, decode_page_token, encode_page_token

from src.services.PrismaService import PrismaService

PREVIEW_CHARS = 100
TITLE_CHARS = 50
# Upper bound on unsummarized history loaded per turn; older messages live on in the summary.
HISTORY_LIMIT = 100


def _db():
    return PrismaService().prisma


def _cursor_where(cursor: dict | None, time_field: str) -> dict:
    if not cursor:
        return {}
    at = datetime.fromisoformat(cursor["t"])
    return {"OR": [{time_field: {"lt": at}}, {time_field: at, "id": {"lt": cursor["id"]}}]}


def _page(rows: list, size: int, time_field: str) -> tuple[list, str]:
    if len(rows) <= size:
        return rows, ""
    last = rows[size - 1]
    return rows[:size], encode_page_token({"t": getattr(last, time_field).isoformat(), "id": last.id})


async def find_by_request(user_id: str, request_id: str) -> Conversation | None:
    return await _db().conversation.find_first(where={"userId": user_id, "requestId": request_id})


async def create_conversation(
    conversation_id: str, user_id: str, file_id: str | None, collection_id: str | None, request_id: str | None
) -> Conversation:
    return await _db().conversation.create(
        data={
            "id": conversation_id,
            "userId": user_id,
            "fileId": file_id,
            "collectionId": collection_id,
            "requestId": request_id,
        }
    )


async def get_conversation(user_id: str, conversation_id: str) -> Conversation | None:
    return await _db().conversation.find_first(where={"id": conversation_id, "userId": user_id})


async def list_conversations(
    user_id: str, file_id: str | None, collection_id: str | None, page_size: int, page_token: str
) -> tuple[list[Conversation], str]:
    size = clamp_page_size(page_size)
    where: dict[str, Any] = {"userId": user_id, **_cursor_where(decode_page_token(page_token), "updatedAt")}
    if file_id:
        where["fileId"] = file_id
    if collection_id:
        where["collectionId"] = collection_id
    rows = await _db().conversation.find_many(
        where=where, order=[{"updatedAt": "desc"}, {"id": "desc"}], take=size + 1
    )
    return _page(rows, size, "updatedAt")


async def delete_conversation(user_id: str, conversation_id: str) -> Conversation | None:
    conversation = await get_conversation(user_id, conversation_id)
    if conversation is None:
        return None
    deleted = await _db().conversation.delete_many(where={"id": conversation_id, "userId": user_id})
    return conversation if deleted else None


async def list_messages(conversation_id: str, page_size: int, page_token: str) -> tuple[list[Message], str]:
    size = clamp_page_size(page_size)
    where = {"conversationId": conversation_id, **_cursor_where(decode_page_token(page_token), "timestamp")}
    rows = await _db().message.find_many(where=where, order=[{"timestamp": "desc"}, {"id": "desc"}], take=size + 1)
    return _page(rows, size, "timestamp")


async def find_request(conversation_id: str, request_id: str) -> tuple[Message | None, Message | None]:
    question = await _db().message.find_first(where={"conversationId": conversation_id, "requestId": request_id})
    if question is None:
        return None, None
    reply = await _db().message.find_first(where={"replyToId": question.id})
    return question, reply


async def add_user_message(
    conversation: Conversation, content: str, file_ids: list[str], request_id: str | None
) -> Message:
    try:
        message = await _db().message.create(
            data={
                "conversationId": conversation.id,
                "role": "user",
                "content": content,
                "fileIds": file_ids,
                "requestId": request_id,
            }
        )
    except UniqueViolationError:
        question, _ = await find_request(conversation.id, request_id or "")
        if question is None:
            raise
        return question
    await _record(conversation, content, title=_title(content))
    return message


async def add_assistant_message(
    conversation: Conversation,
    reply_to: Message,
    content: str,
    hits: list[dict[str, Any]],
    file_ids: list[str],
    tools_used: list[str],
) -> Message:
    message = await _db().message.create(
        data={
            "conversationId": conversation.id,
            "role": "assistant",
            "content": content,
            "searchResults": Json(hits),
            "fileIds": file_ids,
            "toolsUsed": tools_used,
            "replyToId": reply_to.id,
        }
    )
    await _record(conversation, content)
    return message


async def history(conversation: Conversation, upto: Message) -> list[Message]:
    window: dict[str, Any] = {"lte": upto.timestamp}
    if conversation.summarizedUntil:
        window["gt"] = conversation.summarizedUntil
    rows = await _db().message.find_many(
        where={"conversationId": conversation.id, "timestamp": window},
        order=[{"timestamp": "desc"}, {"id": "desc"}],
        take=HISTORY_LIMIT,
    )
    return list(reversed(rows))


async def save_summary(conversation_id: str, summary: str, until: datetime) -> None:
    await _db().conversation.update(
        where={"id": conversation_id}, data={"summary": summary, "summarizedUntil": until}
    )


def scope_filter(user_id: str, file_ids: list[str], collection_ids: list[str]) -> dict:
    scopes = []
    if file_ids:
        scopes.append({"fileId": {"in": file_ids}})
    if collection_ids:
        scopes.append({"collectionId": {"in": collection_ids}})
    return {"userId": user_id, "OR": scopes}


async def count_scoped(where: dict) -> int:
    return await _db().conversation.count(where=where)


async def delete_scoped(where: dict) -> int:
    return await _db().conversation.delete_many(where=where)


async def delete_for_user(user_id: str) -> int:
    return await _db().conversation.delete_many(where={"userId": user_id})


async def _record(conversation: Conversation, content: str, title: str | None = None) -> None:
    data: dict[str, Any] = {"messageCount": {"increment": 1}, "lastMessagePreview": content[:PREVIEW_CHARS]}
    if title and not conversation.title:
        data["title"] = title
        conversation.title = title
    await _db().conversation.update(where={"id": conversation.id}, data=data)


def _title(content: str) -> str:
    text = " ".join(content.split())
    return text if len(text) <= TITLE_CHARS else text[:TITLE_CHARS].rstrip() + "..."

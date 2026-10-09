import json
import logging
from typing import Any, AsyncIterator

from prisma.models import Conversation, Message
from ragspace.chat.v1 import chat_pb2
from ragspace.common.v1 import common_pb2
from ragspace_shared.paging import assert_batch_size
from ragspace_shared.rpc import invalid_argument, not_found

from src import hits as hit_store
from src.clients import resolve_collection_file_ids
from src.config import settings
from src.graph.orchestrator import graph
from src.services import conversation_store as store
from src.services.SummaryService import SummaryService

logger = logging.getLogger(__name__)

MAX_SCOPE_FILES = 1000
SYNTHESIZER = "synthesize"

_STEP_STATUS = {
    "started": chat_pb2.STEP_STATUS_STARTED,
    "done": chat_pb2.STEP_STATUS_DONE,
    "failed": chat_pb2.STEP_STATUS_FAILED,
}
_RESULTS_KIND = {"search": chat_pb2.RESULTS_KIND_SEARCH, "scene_thumbnails": chat_pb2.RESULTS_KIND_SCENE_THUMBNAILS}


async def send_message(request: chat_pb2.SendMessageRequest) -> AsyncIterator[chat_pb2.SendMessageResponse]:
    content = request.content.strip()
    if not content:
        raise invalid_argument("content is required")
    if len(content) > settings.max_message_chars:
        raise invalid_argument(f"content accepts at most {settings.max_message_chars} characters")
    conversation = await store.get_conversation(request.user_id, request.conversation_id)
    if conversation is None:
        raise not_found("Conversation")

    request_id = request.request_id or None
    question = None
    if request_id:
        question, reply = await store.find_request(conversation.id, request_id)
        if reply is not None:
            async for event in _replay(request.user_id, reply):
                yield event
            return

    file_ids = list(request.file_ids) or await _scope(conversation)
    assert_batch_size(file_ids, "file_ids", MAX_SCOPE_FILES)
    if question is None:
        question = await store.add_user_message(conversation, content, file_ids, request_id)
    history, summary = await _history(conversation, question)

    async for event in _run(conversation, question, content, file_ids, history, summary):
        yield event


async def _scope(conversation: Conversation) -> list[str]:
    if conversation.fileId:
        return [conversation.fileId]
    if conversation.collectionId:
        return await resolve_collection_file_ids(conversation.userId, conversation.collectionId)
    return []


async def _history(conversation: Conversation, question: Message) -> tuple[list[dict[str, str]], str | None]:
    messages = await store.history(conversation, question)
    summary = conversation.summary
    if len(messages) > settings.summary_threshold:
        older, recent = messages[: -settings.keep_recent_messages], messages[-settings.keep_recent_messages :]
        folded = await SummaryService().summarize([_turn(m) for m in older], summary)
        if folded:
            await store.save_summary(conversation.id, folded, older[-1].timestamp)
            summary, messages = folded, recent
    return [_turn(m) for m in messages], summary


def _turn(message: Message) -> dict[str, str]:
    return {"role": message.role, "content": message.content}


async def _run(
    conversation: Conversation,
    question: Message,
    content: str,
    file_ids: list[str],
    history: list[dict[str, str]],
    summary: str | None,
) -> AsyncIterator[chat_pb2.SendMessageResponse]:
    state: dict[str, Any] = {
        "user_message": content,
        "user_id": conversation.userId,
        "file_ids": file_ids,
        "conversation_history": history,
        "conversation_summary": summary,
        "attached_files": [],
        "intent": None,
        "query_modality": None,
        "search_results": [],
        "retrieved_context": None,
        "final_response": None,
        "tools_used": [],
        "events": [],
    }
    streamed, hits, tools_used, answer = "", [], [], None
    synthesizing = False
    try:
        async for mode, payload in graph.astream(state, stream_mode=["updates", "messages"]):
            if mode == "messages":
                chunk, metadata = payload
                if metadata.get("langgraph_node") != SYNTHESIZER or not getattr(chunk, "content", None):
                    continue
                if not synthesizing:
                    synthesizing = True
                    yield step_event("synthesizer", "Generating response...", "started")
                streamed += chunk.content
                yield chat_pb2.SendMessageResponse(delta=chat_pb2.DeltaEvent(text=chunk.content))
                continue
            for node, update in payload.items():
                if not update:
                    continue
                if node == SYNTHESIZER:
                    answer = update.get("final_response") or streamed
                    if not synthesizing:
                        yield step_event("synthesizer", "Generating response...", "started")
                    # A fallback reply after a failed model call was never streamed token by token.
                    if answer.startswith(streamed) and len(answer) > len(streamed):
                        yield chat_pb2.SendMessageResponse(delta=chat_pb2.DeltaEvent(text=answer[len(streamed) :]))
                tools_used = update.get("tools_used", tools_used)
                for event in update.get("events", []):
                    if event["type"] == "results":
                        hits.extend(event["hits"])
                    yield to_response(event)
    except Exception:
        logger.exception("Chat graph failed for conversation %s", conversation.id)
        yield error_event("model_error", "The assistant could not complete this reply. Please try again.")
        return

    reply = await store.add_assistant_message(
        conversation, question, answer or streamed, hit_store.to_stored(hits), file_ids, tools_used
    )
    yield chat_pb2.SendMessageResponse(
        done=chat_pb2.DoneEvent(message_id=reply.id, tools_used=tools_used, result_count=len(hits))
    )


async def _replay(user_id: str, reply: Message) -> AsyncIterator[chat_pb2.SendMessageResponse]:
    hits = hit_store.from_stored(reply.searchResults)
    try:
        await hit_store.hydrate(user_id, hits)
    except Exception:
        logger.warning("Could not refresh URLs for replayed message %s", reply.id, exc_info=True)
    if hits:
        yield chat_pb2.SendMessageResponse(
            results=chat_pb2.ResultsEvent(kind=chat_pb2.RESULTS_KIND_SEARCH, hits=hits)
        )
    yield chat_pb2.SendMessageResponse(delta=chat_pb2.DeltaEvent(text=reply.content))
    yield chat_pb2.SendMessageResponse(
        done=chat_pb2.DoneEvent(message_id=reply.id, tools_used=reply.toolsUsed or [], result_count=len(hits))
    )


def step_event(step: str, label: str, status: str) -> chat_pb2.SendMessageResponse:
    return chat_pb2.SendMessageResponse(step=chat_pb2.StepEvent(step=step, label=label, status=_STEP_STATUS[status]))


def error_event(code: str, message: str) -> chat_pb2.SendMessageResponse:
    return chat_pb2.SendMessageResponse(error=chat_pb2.ErrorEvent(code=code, message=message))


def to_response(event: dict[str, Any]) -> chat_pb2.SendMessageResponse:
    if event["type"] == "step":
        step = chat_pb2.StepEvent(step=event["step"], label=event["label"], status=_STEP_STATUS[event["status"]])
        if event.get("error"):
            step.error = event["error"]
        if event.get("error_code"):
            step.error_code = event["error_code"]
        return chat_pb2.SendMessageResponse(step=step)
    if event["type"] == "tool":
        tool = chat_pb2.ToolEvent(tool=event["tool"])
        if event["status"] == "started":
            tool.status = chat_pb2.TOOL_STATUS_STARTED
            tool.arguments_json = json.dumps(event.get("arguments") or {})
        else:
            tool.status = chat_pb2.TOOL_STATUS_DONE
            tool.result_count = event.get("result_count", 0)
        return chat_pb2.SendMessageResponse(tool=tool)
    hits: list[common_pb2.SearchHit] = event["hits"]
    return chat_pb2.SendMessageResponse(results=chat_pb2.ResultsEvent(kind=_RESULTS_KIND[event["kind"]], hits=hits))

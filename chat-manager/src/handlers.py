import logging

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2

from src.services import conversation_store as store
from src.services import quota

logger = logging.getLogger(__name__)


async def handle_event(envelope: events_pb2.Envelope) -> None:
    kind = envelope.WhichOneof("payload")
    if kind == "file_deleted":
        event = envelope.file_deleted
        await _delete_scoped(envelope.id, event.user_id, [event.file_id], [])
    elif kind == "collection_deleted":
        event = envelope.collection_deleted
        await _delete_scoped(envelope.id, event.user_id, [], list(event.collection_ids))
    elif kind == "user_deleted":
        removed = await store.delete_for_user(envelope.user_deleted.user_id)
        logger.info("Removed %d conversations for deleted user %s", removed, envelope.user_deleted.user_id)


async def _delete_scoped(event_id: str, user_id: str, file_ids: list[str], collection_ids: list[str]) -> None:
    where = store.scope_filter(user_id, file_ids, collection_ids)
    # Release before deleting: a redelivered event recounts the same rows, and the event id keeps the release idempotent.
    count = await store.count_scoped(where)
    await quota.release(user_id, common_pb2.USAGE_METRIC_FILE_CONVERSATIONS, count, f"{event_id}:conversations")
    removed = await store.delete_scoped(where)
    logger.info("Removed %d scoped conversations for user %s", removed, user_id)

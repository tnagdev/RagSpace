import asyncio
import logging
import random
import uuid
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path

import aio_pika
from aio_pika.abc import AbstractIncomingMessage, AbstractRobustConnection
from google.protobuf import json_format
from google.protobuf.message import Message

from ragspace.events.v1 import events_pb2

from ..context import correlation_id_var, current_correlation_id

EVENTS_EXCHANGE = "ragspace.events"
DEAD_LETTER_EXCHANGE = f"{EVENTS_EXCHANGE}.dlx"
MAX_ATTEMPTS = 5
PUBLISH_TIMEOUT_S = 5.0
MAX_CONNECT_BACKOFF_S = 60.0
# docker-compose.prod.yml marks a consumer unhealthy when this file is older than 60s.
HEARTBEAT_PATH = "/tmp/consumer-health"

ROUTING_KEYS = {
    "user_created": "user.created",
    "user_deleted": "user.deleted",
    "file_uploaded": "file.uploaded",
    "file_stage_changed": "file.stage_changed",
    "file_scenes_detected": "file.scenes_detected",
    "file_updated": "file.updated",
    "file_deleted": "file.deleted",
    "collection_deleted": "collection.deleted",
}

EventHandler = Callable[[events_pb2.Envelope], Awaitable[None]]

logger = logging.getLogger("events")


class PermanentEventError(Exception):
    pass


class EventBus:
    def __init__(self, url: str, producer: str) -> None:
        self.url = url
        self.producer = producer
        self._connection: AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None
        self._attempts: dict[str, int] = {}

    @property
    def connected(self) -> bool:
        return self._connection is not None and self._connection.connected.is_set()

    async def start(self) -> None:
        if self._connection:
            return
        self._connection = await _connect_with_backoff(self.url)
        channel = await self._connection.channel(publisher_confirms=True)
        self._exchange = await channel.declare_exchange(
            EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def publish(self, field: str, payload: Message, correlation_id: str | None = None) -> events_pb2.Envelope:
        if not self._exchange:
            raise RuntimeError("EventBus not started")
        envelope = events_pb2.Envelope(
            id=str(uuid.uuid4()),
            type=ROUTING_KEYS[field],
            correlation_id=correlation_id or current_correlation_id(),
            producer=self.producer,
        )
        envelope.occur_time.GetCurrentTime()
        getattr(envelope, field).CopyFrom(payload)
        message = aio_pika.Message(
            json_format.MessageToJson(envelope).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=envelope.id,
        )
        await asyncio.wait_for(
            self._exchange.publish(message, routing_key=envelope.type), timeout=PUBLISH_TIMEOUT_S
        )
        return envelope

    async def subscribe(
        self,
        queue: str,
        routing_keys: Sequence[str],
        handler: EventHandler,
        prefetch: int = 1,
    ) -> None:
        if not self._connection:
            raise RuntimeError("EventBus not started")
        channel = await self._connection.channel()
        await channel.set_qos(prefetch_count=prefetch)
        exchange = await channel.declare_exchange(
            EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )
        dead_letter = await channel.declare_exchange(
            DEAD_LETTER_EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
        )
        dlq = await channel.declare_queue(f"{queue}.dlq", durable=True)
        await dlq.bind(dead_letter, routing_key=queue)
        consumer_queue = await channel.declare_queue(
            queue,
            durable=True,
            arguments={"x-dead-letter-exchange": DEAD_LETTER_EXCHANGE, "x-dead-letter-routing-key": queue},
        )
        for key in routing_keys:
            await consumer_queue.bind(exchange, routing_key=key)
        await consumer_queue.consume(lambda message: self._dispatch(message, handler))
        logger.info("Consuming %s [%s]", queue, ", ".join(routing_keys))

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            self._connection = None

    async def _dispatch(self, message: AbstractIncomingMessage, handler: EventHandler) -> None:
        try:
            envelope = json_format.Parse(message.body, events_pb2.Envelope(), ignore_unknown_fields=True)
        except Exception:
            logger.exception("Dropping unparseable event")
            await message.reject(requeue=False)
            return

        correlation_id_var.set(envelope.correlation_id or str(uuid.uuid4()))
        try:
            await handler(envelope)
            self._attempts.pop(envelope.id, None)
            await message.ack()
        except PermanentEventError:
            logger.exception("%s %s rejected permanently", envelope.type, envelope.id)
            await message.reject(requeue=False)
        except Exception as error:
            attempt = self._attempts.get(envelope.id, 0) + 1
            if attempt >= MAX_ATTEMPTS:
                self._attempts.pop(envelope.id, None)
                logger.exception("%s %s failed %d times; dead-lettering", envelope.type, envelope.id, attempt)
                await message.reject(requeue=False)
                return
            self._attempts[envelope.id] = attempt
            logger.warning("%s %s attempt %d failed: %s", envelope.type, envelope.id, attempt, error)
            await asyncio.sleep(_backoff_s(attempt))
            await message.nack(requeue=True)


async def heartbeat(bus: EventBus, path: str = HEARTBEAT_PATH, interval_s: float = 15.0) -> None:
    """Touches `path` while `bus` is connected, so a healthcheck can tell a working consumer from one cut off from the broker."""
    target = Path(path)
    while True:
        if bus.connected:
            target.touch()
        await asyncio.sleep(interval_s)


async def _connect_with_backoff(url: str) -> AbstractRobustConnection:
    attempt = 0
    while True:
        try:
            connection = await aio_pika.connect_robust(url, timeout=10)
            logger.info("RabbitMQ connected")
            return connection
        except Exception as error:
            attempt += 1
            delay = _backoff_s(attempt, cap=MAX_CONNECT_BACKOFF_S)
            logger.warning("RabbitMQ connect attempt %d failed (%s); retrying in %.1fs", attempt, error, delay)
            await asyncio.sleep(delay)


def _backoff_s(attempt: int, cap: float = 30.0) -> float:
    base = min(cap, 0.5 * 2**attempt)
    return base / 2 + random.random() * base / 2

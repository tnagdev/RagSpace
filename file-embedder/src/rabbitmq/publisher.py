"""Lightweight RabbitMQ publisher for file-embedder progress events."""
import logging
import json
from typing import Any, Dict
import aio_pika
from src.config import settings

logger = logging.getLogger(__name__)


async def publish_event(event_type: str, data: Dict[str, Any]) -> None:
    """Publish a single event to the file.events exchange.

    Opens a transient connection per call — progress events are infrequent
    enough that a persistent producer would add unnecessary complexity here.
    Failures are swallowed so a publish error never breaks the main pipeline.
    """
    try:
        connection = await aio_pika.connect_robust(
            settings.rabbitmq_url,
            reconnect_interval=5,
            fail_fast=True,
            heartbeat=15,
        )
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                settings.rabbitmq_exchange,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
            message = aio_pika.Message(
                body=json.dumps(data, default=str).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            )
            await exchange.publish(message, routing_key=event_type)
            logger.debug(f"Published {event_type} for file {data.get('fileId', '?')}")
    except Exception as exc:
        logger.warning(f"Failed to publish {event_type}: {exc}")

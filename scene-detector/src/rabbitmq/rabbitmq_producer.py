import logging
import json
from typing import Optional
from aio_pika import connect_robust, Message, ExchangeType
from aio_pika.abc import AbstractRobustConnection, AbstractRobustChannel
from src.config.settings import settings
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)

@singleton
class RabbitMQProducer:
    """RabbitMQ service for publishing events"""
    
    def __init__(self):
        self.connection: Optional[AbstractRobustConnection] = None
        self.channel: Optional[AbstractRobustChannel] = None
        self.exchange = None
    
    async def connect(self):
        """Connect to RabbitMQ"""
        if self.connection is None or self.connection.is_closed:
            self.connection = await connect_robust(settings.rabbitmq_url)
            self.channel = await self.connection.channel()
            
            # Declare exchange
            self.exchange = await self.channel.declare_exchange(
                settings.rabbitmq_exchange,
                ExchangeType.TOPIC,
                durable=True
            )
            
            logger.info(f"Connected to RabbitMQ at {settings.rabbitmq_url}")
    
    async def disconnect(self):
        """Disconnect from RabbitMQ"""
        if self.channel:
            await self.channel.close()
        if self.connection:
            await self.connection.close()
        logger.info("Disconnected from RabbitMQ")
    
    async def publish_event(self, event_type: str, data: dict):
        """Publish an event to RabbitMQ"""
        try:
            await self.connect()
            
            message_body = json.dumps(data)
            message = Message(
                body=message_body.encode(),
                content_type="application/json",
                delivery_mode=2  # Persistent
            )
            
            await self.exchange.publish(
                message,
                routing_key=event_type
            )
            
            logger.info(f"Published event: {event_type} for file {data.get('fileId')}")
        except Exception as e:
            logger.error(f"Failed to publish event {event_type}: {e}")
            raise

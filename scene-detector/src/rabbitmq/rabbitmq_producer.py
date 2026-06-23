import asyncio
import logging
import json
from typing import Optional, Dict, Any
from aio_pika import connect_robust, Message, ExchangeType
from aio_pika.abc import AbstractRobustConnection, AbstractRobustChannel, AbstractRobustExchange
from src.config.settings import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class RabbitMQProducer(metaclass=SingletonMeta):
    """RabbitMQ service for publishing events with connection pooling."""
    
    def __init__(self) -> None:
        self.connection: Optional[AbstractRobustConnection] = None
        self.channel: Optional[AbstractRobustChannel] = None
        self.exchange: Optional[AbstractRobustExchange] = None
        self._is_connected: bool = False
    
    async def connect(self) -> None:
        """Establish robust connection to RabbitMQ if not already connected."""
        if self._is_connected and self.connection and not self.connection.is_closed:
            return
        
        try:
            logger.info("Connecting RabbitMQ producer...")
            self.connection = await connect_robust(
                settings.rabbitmq_url,
                reconnect_interval=5,
                fail_fast=False,
                heartbeat=15
            )
            self.channel = await self.connection.channel()
            self.exchange = await self.channel.declare_exchange(
                settings.rabbitmq_exchange,
                ExchangeType.TOPIC,
                durable=True
            )
            self._is_connected = True
            logger.info("✓ RabbitMQ producer connected")
            
        except Exception as e:
            logger.error(f"Failed to connect RabbitMQ producer: {e}")
            self._is_connected = False
            raise
    
    async def disconnect(self) -> None:
        """Gracefully disconnect from RabbitMQ."""
        try:
            if self.channel and not self.channel.is_closed:
                await self.channel.close()
            
            if self.connection and not self.connection.is_closed:
                await self.connection.close()
            
            logger.info("✓ RabbitMQ producer disconnected")
            
        except Exception as e:
            logger.error(f"Error disconnecting producer: {e}")
        
        finally:
            self._is_connected = False
            self.connection = None
            self.channel = None
            self.exchange = None
    
    async def publish_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Publish an event to RabbitMQ with automatic connection management.
        
        Args:
            event_type: The routing key for the event
            data: Event payload as dictionary
        """
        try:
            await self.connect()
            
            if not self.exchange:
                raise RuntimeError("Exchange not initialized")
            
            message_body = json.dumps(data, default=str)
            message = Message(
                body=message_body.encode('utf-8'),
                content_type="application/json",
                delivery_mode=2,
                message_id=data.get('fileId', 'unknown')
            )
            
            try:
                await asyncio.wait_for(
                    self.exchange.publish(message, routing_key=event_type),
                    timeout=10.0
                )
            except asyncio.TimeoutError:
                raise TimeoutError(
                    f"Timed out publishing event {event_type} after 10 seconds"
                )
            logger.info(f"✓ Published event: {event_type} (file: {data.get('fileId', 'N/A')})")
        except Exception as e:
            logger.error(f"Failed to publish event {event_type}: {e}", exc_info=True)
            self._is_connected = False
            raise

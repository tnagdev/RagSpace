"""RabbitMQ consumer for processing file events."""
import logging
import json
import asyncio
from typing import Callable, Dict, Any, Optional, List
import aio_pika
from aio_pika.abc import AbstractRobustConnection, AbstractRobustChannel, AbstractRobustExchange, AbstractRobustQueue
from pydantic import ValidationError
from src.config import settings
from src.models.events import (
    UploadCompletedEventModel,
    ProcessingCompletedEventModel,
    FileDeletedEventModel
)

logger = logging.getLogger(__name__)


class FileEventType:
    """File event type constants matching the upload-manager service."""
    UPLOAD_STARTED: str = "file.upload.started"
    UPLOAD_PROGRESS: str = "file.upload.progress"
    UPLOAD_COMPLETED: str = "file.upload.completed"
    UPLOAD_FAILED: str = "file.upload.failed"
    PROCESSING_STARTED: str = "file.processing.started"
    PROCESSING_COMPLETED: str = "file.processing.completed"
    PROCESSING_FAILED: str = "file.processing.failed"
    FILE_DELETED: str = "file.deleted"


class RabbitMQConsumer:
    """RabbitMQ consumer with automatic reconnection and error handling."""

    def __init__(
        self,
        rabbitmq_url: str,
        exchange_name: str,
        queue_name: str
    ) -> None:
        self.rabbitmq_url: str = rabbitmq_url
        self.exchange_name: str = exchange_name
        self.queue_name: str = queue_name
        self.connection: Optional[AbstractRobustConnection] = None
        self.channel: Optional[AbstractRobustChannel] = None
        self.exchange: Optional[AbstractRobustExchange] = None
        self.queue: Optional[AbstractRobustQueue] = None
        self.handlers: Dict[str, Callable] = {}
        self._is_consuming: bool = False
    
    async def connect(self) -> None:
        """Establish robust connection to RabbitMQ.
        
        Uses connect_robust() which handles reconnection automatically.
        No manual retry needed - aio_pika handles it internally.
        """
        try:
            logger.info("Connecting to RabbitMQ...")
            self.connection = await aio_pika.connect_robust(
                self.rabbitmq_url,
                reconnect_interval=5,
                fail_fast=False,
                heartbeat=15
            )
            
            self.connection.reconnect_callbacks.add(self._on_reconnect)
            await self._setup_channel()
            logger.info("✓ Successfully connected to RabbitMQ")
        except Exception as e:
            logger.error(f"Failed to establish RabbitMQ connection: {e}", exc_info=True)
            raise
    
    async def _setup_channel(self) -> None:
        """Setup channel, exchange, and queue."""
        if not self.connection:
            raise RuntimeError("Connection not established")
        
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=10)
        
        self.exchange = await self.channel.declare_exchange(
            self.exchange_name,
            aio_pika.ExchangeType.TOPIC,
            durable=True
        )
        
        self.queue = await self.channel.declare_queue(
            self.queue_name,
            durable=True
        )
        
        logger.info(f"✓ Channel setup complete - Queue: {self.queue_name}")
    
    async def _on_reconnect(self, connection: AbstractRobustConnection) -> None:
        """Callback when connection is restored - reestablish channel and resume consuming."""
        try:
            logger.info("Reconnection detected, reestablishing channel...")
            await asyncio.sleep(1)

            if connection.is_closed:
                logger.warning("Connection still closed, waiting...")
                return
            
            self.connection = connection
            await self._setup_channel()
            
            if self._is_consuming:
                await self.queue.consume(self.process_message)
                logger.info("✓ Consumer restarted after reconnection")
                
        except Exception as e:
            logger.error(f"Reconnection setup failed: {e}", exc_info=True)
    
    def register_handler(self, event_type: str, handler: Optional[Callable] = None) -> Callable:
        """Register a handler for an event type. Can be used as decorator or direct call."""
        def decorator(func: Callable) -> Callable:
            self.handlers[event_type] = func
            logger.info(f"Registered handler for event: {event_type}")
            return func
        
        return decorator if handler is None else decorator(handler)
    
    async def bind_routing_keys(self, routing_keys: List[str]) -> None:
        """Bind queue to multiple routing keys."""
        if not self.queue or not self.exchange:
            raise RuntimeError("Queue and exchange must be declared before binding")
        
        logger.info(f"Binding {len(routing_keys)} routing keys to queue '{self.queue_name}'")
        
        for routing_key in routing_keys:
            await self.queue.bind(self.exchange, routing_key=routing_key)
            logger.debug(f"✓ Bound: {routing_key}")
        
        logger.info("✓ All routing keys bound successfully")    
    
    async def process_message(self, message: aio_pika.IncomingMessage) -> None:
        """Process incoming RabbitMQ message with comprehensive error handling."""
        message_id = message.message_id or "unknown"
        event_type = "unknown"
        
        async with message.process(requeue=False, ignore_processed=True):
            try:
                if not self.channel or self.channel.is_closed:
                    logger.warning(f"Channel closed, cannot process message {message_id}")
                    raise RuntimeError("Channel is not available")
                
                try:
                    body = json.loads(message.body.decode())
                    event_type = body.get("type", "unknown")
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in message {message_id}: {e}")
                    return
                
                logger.debug(f"Processing message {message_id}: {event_type}")
                
                handler = self.handlers.get(event_type)
                if not handler:
                    logger.warning(f"No handler registered for: {event_type}")
                    return
                
                try:
                    event_model = self._parse_event(event_type, body)
                except ValidationError as e:
                    logger.error(f"Invalid event data for {event_type}: {e}")
                    return
                
                try:
                    await asyncio.wait_for(handler(event_model), timeout=600.0)
                    logger.info(f"✓ Processed: {event_type}")
                    
                except asyncio.TimeoutError:
                    logger.error(f"Handler timeout (10min) for {event_type}")
            
                except Exception as e:
                    logger.error(f"Handler error for {event_type}: {e}", exc_info=True)
                    
            except Exception as e:
                logger.error(f"Critical error processing {message_id}: {e}", exc_info=True)

    def _parse_event(self, event_type: str, body: Dict[str, Any]) -> Any:
        """Parse event body into typed Pydantic model."""
        event_model_map = {
            FileEventType.UPLOAD_COMPLETED: UploadCompletedEventModel,
            FileEventType.PROCESSING_COMPLETED: ProcessingCompletedEventModel,
            FileEventType.FILE_DELETED: FileDeletedEventModel,
        }
        
        model_class = event_model_map.get(event_type)
        if not model_class:
            logger.warning(f"No model defined for: {event_type}, using raw dict")
            return body
        
        return model_class(**body)
    
    async def start_consuming(self) -> None:
        """Start consuming messages from the queue."""
        if not self.queue:
            raise RuntimeError("Queue not initialized - call connect() first")
        
        logger.info(f"Starting consumer for queue: {self.queue_name}")
        logger.info(f"Registered handlers: {list(self.handlers.keys())}")
        await self.queue.consume(self.process_message)
        self._is_consuming = True
        logger.info("✓ Consumer active and listening")
    
    async def start(self, routing_keys: Optional[List[str]] = None) -> None:
        """Initialize and start the RabbitMQ consumer.
        
        Args:
            routing_keys: List of routing keys to bind the queue to
        """
        await self.connect()
        
        if routing_keys:
            await self.bind_routing_keys(routing_keys)
        
        await self.start_consuming()
    
    async def stop(self) -> None:
        """Stop the consumer and close all connections."""
        self._is_consuming = False
        
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            logger.info("✓ RabbitMQ connection closed")
        
        self.connection = None
        self.channel = None
        self.exchange = None
        self.queue = None

rabbitmq_consumer = RabbitMQConsumer(
    rabbitmq_url=settings.rabbitmq_url,
    exchange_name=settings.rabbitmq_exchange,
    queue_name=settings.rabbitmq_queue
)
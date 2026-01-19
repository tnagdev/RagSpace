import logging
import json
import asyncio
from typing import Callable, Dict, Any
import aio_pika
from pydantic_core import ValidationError
from src.common.enums import EventType
from src.config.settings import settings
from src.models.events import UploadCompletedEventModel, FileDeletedEventModel

logger = logging.getLogger(__name__)


class RabbitMQConsumer:

    def __init__(
        self
    ):
        self.rabbitmq_url = settings.rabbitmq_url
        self.exchange_name = settings.rabbitmq_exchange
        self.queue_name = settings.rabbitmq_queue
        self.connection = None
        self.channel = None
        self.exchange = None
        self.queue = None
        self.handlers: Dict[str, Callable] = {}

    async def connect(self):
        """Establish connection to RabbitMQ and setup exchange/queue with retry logic."""
        max_retries = 5
        retry_delay = 5
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to RabbitMQ (attempt {attempt + 1}/{max_retries}): {self.rabbitmq_url}")
                
                # Use connect_robust with reconnection parameters
                self.connection = await aio_pika.connect_robust(
                    self.rabbitmq_url,
                    reconnect_interval=5,
                    fail_fast=False
                )
                
                # Register connection close callback
                self.connection.reconnect_callbacks.add(self._on_reconnect)
                
                self.channel = await self.connection.channel()
                await self.channel.set_qos(prefetch_count=1)

                self.exchange = await self.channel.declare_exchange(
                    self.exchange_name,
                    aio_pika.ExchangeType.TOPIC,
                    durable=True
                )

                self.queue = await self.channel.declare_queue(
                    self.queue_name,
                    durable=True
                )
                
                logger.info(f"✓ Connected to RabbitMQ and declared queue: {self.queue_name}")
                return
                
            except Exception as e:
                logger.error(f"Failed to connect to RabbitMQ (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    logger.error("Max retries reached. Giving up.")
                    raise
    
    async def _on_reconnect(self, connection):
        """Callback when connection is restored."""
        try:
            logger.info("Connection restored, re-establishing channel...")
            # Give the connection a moment to stabilize
            await asyncio.sleep(1)
            
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=1)
            
            self.exchange = await self.channel.declare_exchange(
                self.exchange_name,
                aio_pika.ExchangeType.TOPIC,
                durable=True
            )
            
            self.queue = await self.channel.declare_queue(
                self.queue_name,
                durable=True
            )
            
            logger.info("✓ Channel re-established successfully")
        except Exception as e:
            logger.error(f"Error during reconnection: {e}", exc_info=True)
            # Schedule a retry after delay
            await asyncio.sleep(5)
            try:
                await self._on_reconnect(connection)
            except Exception as retry_error:
                logger.error(f"Reconnection retry failed: {retry_error}")
    
    def register_handler(self, event_type: str, handler: Callable = None):
        """Register a handler for an event type. Can be used as a decorator."""
        def decorator(func: Callable):
            self.handlers[event_type] = func
            logger.info(f"Registered handler for event: {event_type}")
            return func
        
        if handler is None:
            return decorator
        
        else:
            self.handlers[event_type] = handler
            logger.info(f"Registered handler for event: {event_type}")
            return handler

    
    async def bind_routing_keys(self, routing_keys: list):
        logger.info(f"Binding queue '{self.queue_name}' to exchange '{self.exchange_name}'")
        for routing_key in routing_keys:
            await self.queue.bind(self.exchange, routing_key=routing_key)
            logger.info(f"✓ Bound queue to routing key: {routing_key}")
        logger.info(f"All {len(routing_keys)} routing keys bound successfully")    


    async def process_message(self, message: aio_pika.IncomingMessage):
        """Process incoming message with error handling and retry logic."""
        try:
            # Check if channel is valid before processing
            if not self.channel or self.channel.is_closed:
                logger.warning("Channel is closed, rejecting message without processing")
                await message.reject(requeue=True)
                return
            
            async with message.process(requeue=False):
                try:
                    body = json.loads(message.body.decode())
                    event_type = body.get("type")

                    handler = self.handlers.get(event_type)
                    if handler:
                        try:
                            # Parse the event into the appropriate Pydantic model
                            event_model = self._parse_event(event_type, body)
                            await handler(event_model)
                            logger.info(f"✓ Successfully processed event: {event_type}")
                        except ValidationError as e:
                            logger.error(f"Invalid event data for {event_type}: {e}")
                            # Don't requeue invalid messages
                        except Exception as e:
                            logger.error(f"Error in handler for {event_type}: {e}", exc_info=True)
                            # Message will be rejected and moved to DLQ if configured
                    else:
                        logger.warning(f"No handler registered for event: {event_type}")
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode message: {e}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)
        except Exception as e:
            # Handle context manager errors (like ChannelInvalidStateError)
            logger.error(f"Error in message processing context: {e}", exc_info=True)
            try:
                if not self.channel or not self.channel.is_closed:
                    await message.reject(requeue=True)
            except Exception as reject_error:
                logger.error(f"Failed to reject message: {reject_error}")

    

    def _parse_event(self, event_type: str, body: Dict[str, Any]):
        """Parse raw event data into appropriate Pydantic model."""
        event_model_map = {
            EventType.UPLOAD_COMPLETED: UploadCompletedEventModel,
            EventType.FILE_DELETED: FileDeletedEventModel,
        }
        
        model_class = event_model_map.get(event_type)
        if model_class:
            return model_class(**body)
        
        # Fallback to raw dict if no model is defined
        logger.warning(f"No Pydantic model defined for event type: {event_type}")
        return body
    
    async def start_consuming(self):
        """Start consuming messages from the queue."""
        if not self.queue:
            raise RuntimeError("Must call connect() before start_consuming()")

        logger.info(f"Starting to consume messages from queue: {self.queue_name}")
        await self.queue.consume(self.process_message)
        logger.info("Consumer is now actively listening for messages")    
        
    
    async def start(self, routing_keys: list = None):
        """
        Start the RabbitMQ consumer with event handlers.
        
        Args:
            routing_keys: Optional list of routing keys to bind to
        """        
        await self.connect()
        
        if routing_keys:
            await self.bind_routing_keys(routing_keys)

        await self.start_consuming()

    async def stop(self):
        """Stop the RabbitMQ consumer and close connection."""
        await self.close()

    async def close(self):
        """Close RabbitMQ connection."""
        if self.connection:
            await self.connection.close()
            logger.info("RabbitMQ connection closed")


rabbitmq_consumer = RabbitMQConsumer()
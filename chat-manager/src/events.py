from ragspace_shared.events import EventBus

from src.config import settings

event_bus = EventBus(settings.rabbitmq_url, "chat-manager")

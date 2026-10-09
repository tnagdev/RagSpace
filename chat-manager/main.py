from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI
from ragspace.chat.v1 import chat_pb2_grpc
from ragspace_shared.context import configure_logging
from ragspace_shared.rpc import start_grpc_server

from src.config import settings
from src.events import event_bus
from src.handlers import handle_event
from src.rpc.chat_servicer import SERVICE_NAME, ChatServicer
from src.services.PrismaService import PrismaService

configure_logging("chat-manager")


@asynccontextmanager
async def lifespan(app: FastAPI):
    prisma = PrismaService()
    await prisma.connect()
    await event_bus.start()
    await event_bus.subscribe(
        "chat.events", ["file.deleted", "collection.deleted", "user.deleted"], handle_event, prefetch=10
    )
    server = await start_grpc_server(
        lambda s: chat_pb2_grpc.add_ChatServiceServicer_to_server(ChatServicer(), s),
        [SERVICE_NAME],
        port=settings.grpc_port,
    )
    yield
    await server.stop(grace=10)
    await event_bus.close()
    await prisma.disconnect()


app = FastAPI(title="chat-manager", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "chat-manager", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, log_config=None)

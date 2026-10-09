from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI
from ragspace.scenes.v1 import scenes_pb2_grpc
from ragspace_shared.context import configure_logging
from ragspace_shared.rpc import start_grpc_server

from src.config.settings import settings
from src.rpc.scene_servicer import SERVICE_NAME, SceneServicer
from src.services.prisma_service import PrismaService

configure_logging("scene-detector")


@asynccontextmanager
async def lifespan(app: FastAPI):
    prisma = PrismaService()
    await prisma.connect()
    server = await start_grpc_server(
        lambda s: scenes_pb2_grpc.add_SceneServiceServicer_to_server(SceneServicer(), s),
        [SERVICE_NAME],
        port=settings.grpc_port,
    )
    yield
    await server.stop(grace=5)
    await prisma.disconnect()


app = FastAPI(title="scene-detector", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "scene-detector", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    uvicorn.run("main_server:app", host="0.0.0.0", port=settings.port, log_config=None)

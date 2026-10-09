from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytesseract
import uvicorn
from fastapi import FastAPI
from ragspace.search.v1 import search_pb2_grpc
from ragspace_shared.context import configure_logging
from ragspace_shared.rpc import start_grpc_server

from src.config import settings
from src.db.chroma_db import ChromaDatabaseManager
from src.decorators.cpu_manager import run_cpu
from src.rpc.search_servicer import SERVICE_NAME, SearchServicer
from src.services.ImageEmbedderService import ImageEmbedderService

configure_logging("file-embedder")

if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_cpu(ChromaDatabaseManager)
    await run_cpu(ImageEmbedderService)
    server = await start_grpc_server(
        lambda s: search_pb2_grpc.add_SearchServiceServicer_to_server(SearchServicer(), s),
        [SERVICE_NAME],
        port=settings.grpc_port,
    )
    yield
    await server.stop(grace=5)


app = FastAPI(title="file-embedder", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "file-embedder", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    uvicorn.run("main_server:app", host="0.0.0.0", port=settings.port, log_config=None)

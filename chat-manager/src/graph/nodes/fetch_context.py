import logging

import grpc
from langchain_core.runnables import RunnableConfig

from src.clients import batch_get_files
from src.graph.events import step_done, step_started
from src.graph.state import AgentState
from src.logging.node_logger import NodeLogger

logger = logging.getLogger(__name__)

# Beyond this the scope is a large collection; naming every file would swamp the prompt.
MAX_ATTACHED_FILES = 20


async def fetch_context_node(state: AgentState, config: RunnableConfig) -> dict:
    file_ids = state["file_ids"]
    log = NodeLogger(logger, "fetch_context")
    events = [step_started("fetch_context", "Loading context...")]

    attached = []
    if file_ids and len(file_ids) <= MAX_ATTACHED_FILES:
        try:
            files = await batch_get_files(state["user_id"], file_ids)
            attached = [files[file_id] for file_id in file_ids if file_id in files]
        except grpc.aio.AioRpcError as error:
            log.warning("files_failed", code=error.code().name)

    events.append(step_done("fetch_context", "Context ready"))
    log.done(attached=len(attached))
    return {"attached_files": attached, "events": events}

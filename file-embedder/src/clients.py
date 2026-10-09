import grpc
from ragspace.files.v1 import files_pb2, files_pb2_grpc
from ragspace.scenes.v1 import scenes_pb2, scenes_pb2_grpc
from ragspace_shared.paging import MAX_PAGE_SIZE
from ragspace_shared.rpc import RpcClient

from src.config import settings

_files: RpcClient[files_pb2_grpc.FileServiceStub] | None = None
_scenes: RpcClient[scenes_pb2_grpc.SceneServiceStub] | None = None


def files_client() -> RpcClient[files_pb2_grpc.FileServiceStub]:
    global _files
    if _files is None:
        _files = RpcClient(settings.files_grpc_address, files_pb2_grpc.FileServiceStub, "file-embedder", 5.0)
    return _files


def scenes_client() -> RpcClient[scenes_pb2_grpc.SceneServiceStub]:
    global _scenes
    if _scenes is None:
        _scenes = RpcClient(settings.scenes_grpc_address, scenes_pb2_grpc.SceneServiceStub, "file-embedder", 10.0)
    return _scenes


async def get_file(user_id: str, file_id: str, include_urls: bool = False) -> files_pb2.File | None:
    client = files_client()
    try:
        response = await client.stub.GetFile(
            files_pb2.GetFileRequest(user_id=user_id, file_id=file_id, include_urls=include_urls), **client.opts()
        )
    except grpc.aio.AioRpcError as error:
        if error.code() == grpc.StatusCode.NOT_FOUND:
            return None
        raise
    return response.file


async def file_exists(user_id: str, file_id: str) -> bool:
    try:
        return await get_file(user_id, file_id) is not None
    except grpc.aio.AioRpcError:
        return True


async def batch_get_files(user_id: str, file_ids: list[str], include_urls: bool = False) -> dict[str, files_pb2.File]:
    if not file_ids:
        return {}
    client = files_client()
    response = await client.stub.BatchGetFiles(
        files_pb2.BatchGetFilesRequest(user_id=user_id, file_ids=file_ids, include_urls=include_urls), **client.opts()
    )
    return {file.id: file for file in response.files}


async def list_scenes(user_id: str, file_ids: list[str], include_urls: bool = False) -> list[scenes_pb2.Scene]:
    client = scenes_client()
    scenes: list[scenes_pb2.Scene] = []
    token = ""
    while True:
        response = await client.stub.ListScenes(
            scenes_pb2.ListScenesRequest(
                user_id=user_id,
                file_ids=file_ids,
                page_size=MAX_PAGE_SIZE,
                page_token=token,
                include_urls=include_urls,
            ),
            **client.opts(),
        )
        scenes.extend(response.scenes)
        token = response.next_page_token
        if not token:
            return scenes


async def batch_get_scenes(user_id: str, scene_ids: list[str], include_urls: bool = False) -> dict[str, scenes_pb2.Scene]:
    if not scene_ids:
        return {}
    client = scenes_client()
    response = await client.stub.BatchGetScenes(
        scenes_pb2.BatchGetScenesRequest(user_id=user_id, scene_ids=scene_ids, include_urls=include_urls),
        **client.opts(),
    )
    return {scene.id: scene for scene in response.scenes}


async def scene_at(user_id: str, file_id: str, seconds: float, include_urls: bool = False) -> scenes_pb2.Scene | None:
    client = scenes_client()
    request = scenes_pb2.ListScenesRequest(user_id=user_id, file_ids=[file_id], page_size=1, include_urls=include_urls)
    request.start_seconds.max = seconds
    request.end_seconds.min = seconds
    response = await client.stub.ListScenes(request, **client.opts())
    return response.scenes[0] if response.scenes else None

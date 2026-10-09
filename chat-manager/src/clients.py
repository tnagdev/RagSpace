from ragspace.billing.v1 import billing_pb2_grpc
from ragspace.files.v1 import collections_pb2, collections_pb2_grpc, files_pb2, files_pb2_grpc
from ragspace.scenes.v1 import scenes_pb2, scenes_pb2_grpc
from ragspace.search.v1 import search_pb2_grpc
from ragspace_shared.paging import MAX_BATCH_IDS
from ragspace_shared.rpc import RpcClient

from src.config import settings

_clients: dict[str, RpcClient] = {}


def _client(name: str, address: str, stub_cls, timeout_s: float) -> RpcClient:
    if name not in _clients:
        _clients[name] = RpcClient(address, stub_cls, "chat-manager", timeout_s)
    return _clients[name]


def search_client() -> RpcClient[search_pb2_grpc.SearchServiceStub]:
    return _client("search", settings.search_grpc_address, search_pb2_grpc.SearchServiceStub, 60.0)


def files_client() -> RpcClient[files_pb2_grpc.FileServiceStub]:
    return _client("files", settings.files_grpc_address, files_pb2_grpc.FileServiceStub, 5.0)


def collections_client() -> RpcClient[collections_pb2_grpc.CollectionServiceStub]:
    return _client("collections", settings.files_grpc_address, collections_pb2_grpc.CollectionServiceStub, 5.0)


def scenes_client() -> RpcClient[scenes_pb2_grpc.SceneServiceStub]:
    return _client("scenes", settings.scenes_grpc_address, scenes_pb2_grpc.SceneServiceStub, 5.0)


def billing_client() -> RpcClient[billing_pb2_grpc.BillingServiceStub]:
    return _client("billing", settings.billing_grpc_address, billing_pb2_grpc.BillingServiceStub, 3.0)


def _chunks(ids: list[str]) -> list[list[str]]:
    return [ids[i:i + MAX_BATCH_IDS] for i in range(0, len(ids), MAX_BATCH_IDS)]


async def batch_get_files(user_id: str, file_ids: list[str], include_urls: bool = False) -> dict[str, files_pb2.File]:
    client = files_client()
    files: dict[str, files_pb2.File] = {}
    for chunk in _chunks(list(dict.fromkeys(file_ids))):
        response = await client.stub.BatchGetFiles(
            files_pb2.BatchGetFilesRequest(user_id=user_id, file_ids=chunk, include_urls=include_urls), **client.opts()
        )
        files.update({file.id: file for file in response.files})
    return files


async def batch_get_scenes(user_id: str, scene_ids: list[str]) -> dict[str, scenes_pb2.Scene]:
    client = scenes_client()
    scenes: dict[str, scenes_pb2.Scene] = {}
    for chunk in _chunks(list(dict.fromkeys(scene_ids))):
        response = await client.stub.BatchGetScenes(
            scenes_pb2.BatchGetScenesRequest(user_id=user_id, scene_ids=chunk, include_urls=True), **client.opts()
        )
        scenes.update({scene.id: scene for scene in response.scenes})
    return scenes


async def resolve_collection_file_ids(user_id: str, collection_id: str) -> list[str]:
    client = collections_client()
    response = await client.stub.ResolveCollectionFileIds(
        collections_pb2.ResolveCollectionFileIdsRequest(user_id=user_id, collection_id=collection_id, recursive=True),
        **client.opts(),
    )
    return list(response.file_ids)

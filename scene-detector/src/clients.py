import grpc
from ragspace.files.v1 import files_pb2, files_pb2_grpc
from ragspace_shared.rpc import RpcClient

from src.config.settings import settings

_files: RpcClient[files_pb2_grpc.FileServiceStub] | None = None


def files_client() -> RpcClient[files_pb2_grpc.FileServiceStub]:
    global _files
    if _files is None:
        _files = RpcClient(settings.files_grpc_address, files_pb2_grpc.FileServiceStub, "scene-detector", 5.0)
    return _files


async def file_exists(user_id: str, file_id: str) -> bool:
    client = files_client()
    try:
        await client.stub.GetFile(files_pb2.GetFileRequest(user_id=user_id, file_id=file_id), **client.opts())
        return True
    except grpc.aio.AioRpcError as error:
        return error.code() != grpc.StatusCode.NOT_FOUND

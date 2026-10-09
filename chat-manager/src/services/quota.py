from ragspace.billing.v1 import billing_pb2
from ragspace.common.v1 import common_pb2
from ragspace_shared.protos import enum_name
from ragspace_shared.rpc import quota_exceeded

from src.clients import billing_client


def metric_for(file_id: str | None, collection_id: str | None) -> int:
    if file_id or collection_id:
        return common_pb2.USAGE_METRIC_FILE_CONVERSATIONS
    return common_pb2.USAGE_METRIC_CONVERSATIONS


async def consume(user_id: str, metric: int, request_id: str) -> None:
    client = billing_client()
    response = await client.stub.ConsumeQuota(
        billing_pb2.ConsumeQuotaRequest(user_id=user_id, metric=metric, amount=1, request_id=request_id),
        **client.opts(),
    )
    if not response.allowed:
        name = enum_name(common_pb2.UsageMetric, "USAGE_METRIC", metric) or "CONVERSATIONS"
        raise quota_exceeded(name, response.used, response.limit, "Conversation limit reached for your plan")


async def release(user_id: str, metric: int, amount: int, request_id: str) -> None:
    if amount <= 0:
        return
    client = billing_client()
    await client.stub.ReleaseQuota(
        billing_pb2.ReleaseQuotaRequest(user_id=user_id, metric=metric, amount=amount, request_id=request_id),
        **client.opts(),
    )

from typing import Any

from prisma import Prisma
from prisma.models import Scene
from ragspace_shared.paging import clamp_page_size, decode_page_token, encode_page_token

from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service

PURGE_BATCH = 500


async def _db() -> Prisma:
    service = PrismaService()
    await service.ensure_connected()
    return service.prisma


async def list_scenes(
    user_id: str,
    file_ids: list[str],
    bounds: dict[str, float],
    page_size: int,
    page_token: str,
) -> tuple[list[Scene], str]:
    size = clamp_page_size(page_size)
    cursor = decode_page_token(page_token)
    where: dict[str, Any] = {"userId": user_id}
    if file_ids:
        where["fileId"] = {"in": file_ids}
    conditions: list[dict[str, Any]] = [{field: {op: value}} for (field, op), value in _bound_filters(bounds)]
    if cursor:
        conditions.append(
            {"OR": [{"fileId": {"gt": cursor["f"]}}, {"fileId": cursor["f"], "sceneNumber": {"gt": cursor["n"]}}]}
        )
    if conditions:
        where["AND"] = conditions

    rows = await (await _db()).scene.find_many(
        where=where, order=[{"fileId": "asc"}, {"sceneNumber": "asc"}], take=size + 1
    )
    page = rows[:size]
    token = encode_page_token({"f": page[-1].fileId, "n": page[-1].sceneNumber}) if len(rows) > size else ""
    return page, token


async def batch_get(user_id: str, scene_ids: list[str]) -> list[Scene]:
    if not scene_ids:
        return []
    return await (await _db()).scene.find_many(
        where={"userId": user_id, "id": {"in": scene_ids}}, order={"sceneNumber": "asc"}
    )


async def delete_for_files(file_ids: list[str]) -> int:
    db = await _db()
    scenes = await db.scene.find_many(where={"fileId": {"in": file_ids}})
    await S3Service().delete_files_batch([s.thumbnailS3Key for s in scenes if s.thumbnailS3Key])
    return await db.scene.delete_many(where={"fileId": {"in": file_ids}})


async def delete_for_user(user_id: str) -> int:
    db = await _db()
    total = 0
    while batch := await db.scene.find_many(where={"userId": user_id}, take=PURGE_BATCH):
        await S3Service().delete_files_batch([s.thumbnailS3Key for s in batch if s.thumbnailS3Key])
        total += await db.scene.delete_many(where={"id": {"in": [s.id for s in batch]}})
    return total


def _bound_filters(bounds: dict[str, float]):
    mapping = {
        "start_min": ("startTime", "gte"),
        "start_max": ("startTime", "lte"),
        "end_min": ("endTime", "gte"),
        "end_max": ("endTime", "lte"),
    }
    return [(mapping[key], value) for key, value in bounds.items() if key in mapping]

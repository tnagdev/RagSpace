"""TC-33 to TC-47: FastAPI route tests for /scenes endpoints."""

import json
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from src.routes.scenes import router
from src.middleware.InterServiceMiddleware import InterServiceMiddleware


# ── app factories ──────────────────────────────────────────────────────────────

def _make_app(user: dict | None = None) -> FastAPI:
    """FastAPI test app with InterServiceMiddleware pre-injecting a user."""
    app = FastAPI()
    app.add_middleware(InterServiceMiddleware)
    app.include_router(router)
    return app


def _user_header(user_dict: dict) -> dict:
    return {"x-user": json.dumps(user_dict)}


# ── shared fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def app():
    return _make_app()


def _mock_scene(
    scene_id="sc-1",
    file_id="file-1",
    user_id="user-1",
    scene_num=1,
    thumb_key="thumbnails/u/2024/1/scene.jpg",
):
    s = MagicMock()
    s.id = scene_id
    s.fileId = file_id
    s.userId = user_id
    s.sceneNumber = scene_num
    s.startTime = 0.0
    s.endTime = 5.0
    s.startFrame = 0
    s.endFrame = 150
    s.keyframe = 75
    s.duration = 5.0
    s.thumbnailS3Key = thumb_key
    s.thumbnailS3Url = None
    s.metadata = None
    s.createdAt = datetime(2024, 1, 1)
    s.updatedAt = datetime(2024, 1, 1)
    return s


def _prisma_ctx(scenes=None, total=None):
    prisma = MagicMock()
    prisma.scene.find_many = AsyncMock(return_value=scenes or [])
    prisma.scene.count = AsyncMock(return_value=total if total is not None else len(scenes or []))
    prisma.scene.find_unique = AsyncMock(return_value=None)
    prisma.scene.delete_many = AsyncMock()
    ps = MagicMock()
    ps.prisma = prisma
    ps.ensure_connected = AsyncMock()
    return ps, prisma


def _s3_ctx(signed_url="https://signed.example.com/thumb.jpg"):
    s3 = MagicMock()
    s3.get_signed_url = AsyncMock(return_value=signed_url)
    s3.delete_files_batch = AsyncMock(return_value=0)
    return s3


# ── GET /scenes ────────────────────────────────────────────────────────────────

class TestGetScenes:

    async def test_no_filters_returns_all_scenes(self, app):
        """TC-33: No query params → scenes returned with total count."""
        scene = _mock_scene()
        ps, prisma = _prisma_ctx(scenes=[scene], total=1)
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/scenes")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert len(body["scenes"]) == 1

    async def test_file_id_filter_applied(self, app):
        """TC-34: ?file_id=abc → WHERE fileId='abc' forwarded to Prisma."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?file_id=abc")

        where = prisma.scene.find_many.call_args[1]["where"]
        assert where["fileId"] == "abc"

    async def test_file_ids_comma_separated_applies_in_filter(self, app):
        """TC-35: ?file_ids=a,b,c → WHERE fileId IN ['a','b','c']."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?file_ids=a,b,c")

        where = prisma.scene.find_many.call_args[1]["where"]
        assert set(where["fileId"]["in"]) == {"a", "b", "c"}

    async def test_scene_ids_filter_applied(self, app):
        """TC-36: ?scene_ids=s1,s2 → WHERE id IN ['s1','s2']."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?scene_ids=s1,s2")

        where = prisma.scene.find_many.call_args[1]["where"]
        assert set(where["id"]["in"]) == {"s1", "s2"}

    async def test_time_range_filters_added_to_and_conditions(self, app):
        """TC-37: start_time_gte + end_time_lte → AND conditions present."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?start_time_gte=5.0&end_time_lte=10.0")

        where = prisma.scene.find_many.call_args[1]["where"]
        assert "AND" in where
        keys = {list(cond.keys())[0] for cond in where["AND"]}
        assert "startTime" in keys
        assert "endTime" in keys

    async def test_authenticated_user_auto_applies_user_id_filter(self, app):
        """TC-38: Authenticated user → WHERE userId auto-set from x-user header."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()
        user = {"id": "user-me", "email": "me@test.com"}

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes", headers=_user_header(user))

        where = prisma.scene.find_many.call_args[1]["where"]
        assert where.get("userId") == "user-me"

    async def test_explicit_user_id_param_overrides_auth_user(self, app):
        """TC-39: ?user_id=other overrides the authenticated user filter."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()
        auth_user = {"id": "auth-user", "email": "auth@test.com"}

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?user_id=explicit-user", headers=_user_header(auth_user))

        where = prisma.scene.find_many.call_args[1]["where"]
        assert where.get("userId") == "explicit-user"

    async def test_pagination_params_forwarded(self, app):
        """TC-40: ?limit=10&offset=20 → take=10, skip=20 in Prisma call."""
        ps, prisma = _prisma_ctx()
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                await c.get("/scenes?limit=10&offset=20")

        call_kwargs = prisma.scene.find_many.call_args[1]
        assert call_kwargs["take"] == 10
        assert call_kwargs["skip"] == 20

    async def test_signed_urls_generated_for_each_thumbnail(self, app):
        """TC-41: S3 signed URL fetched per scene; value returned in response."""
        scene = _mock_scene()
        ps, prisma = _prisma_ctx(scenes=[scene])
        s3 = _s3_ctx(signed_url="https://cdn.example.com/thumb.jpg")

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/scenes")

        s3.get_signed_url.assert_called_once()
        assert resp.json()["scenes"][0]["thumbnailS3Url"] == "https://cdn.example.com/thumb.jpg"


# ── GET /scenes/{id} ───────────────────────────────────────────────────────────

class TestGetSceneById:

    async def test_found_returns_200_with_signed_url(self, app):
        """TC-42: Existing scene → 200 with thumbnailS3Url populated."""
        scene = _mock_scene(user_id="user-1")
        ps, prisma = _prisma_ctx()
        prisma.scene.find_unique = AsyncMock(return_value=scene)
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/scenes/sc-1", headers=_user_header({"id": "user-1"}))

        assert resp.status_code == 200
        assert resp.json()["id"] == "sc-1"

    async def test_not_found_returns_404(self, app):
        """TC-43: Non-existent scene_id → 404."""
        ps, prisma = _prisma_ctx()
        prisma.scene.find_unique = AsyncMock(return_value=None)

        with patch("src.routes.scenes.PrismaService", return_value=ps):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/scenes/does-not-exist")

        assert resp.status_code == 404

    async def test_different_user_returns_403(self, app):
        """TC-44: Scene owned by another user → 403 Access denied."""
        scene = _mock_scene(user_id="owner-user")
        ps, prisma = _prisma_ctx()
        prisma.scene.find_unique = AsyncMock(return_value=scene)
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get(
                    "/scenes/sc-1",
                    headers=_user_header({"id": "other-user", "email": "x@test.com"}),
                )

        assert resp.status_code == 403

    async def test_unauthenticated_request_returns_scene(self, app):
        """TC-45: No x-user header (anonymous) → scene returned (no auth check)."""
        scene = _mock_scene()
        ps, prisma = _prisma_ctx()
        prisma.scene.find_unique = AsyncMock(return_value=scene)
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.get("/scenes/sc-1")  # no auth header

        assert resp.status_code == 200


# ── DELETE /scenes/user/{user_id} ─────────────────────────────────────────────

class TestDeleteUserScenes:

    async def test_deletes_s3_thumbnails_and_db_rows(self, app):
        """TC-46: User has scenes → S3 + DB cleaned up, count returned."""
        scene = _mock_scene()
        ps, prisma = _prisma_ctx(scenes=[scene])
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete("/scenes/user/user-1")

        assert resp.status_code == 200
        assert resp.json()["deletedCount"] == 1
        s3.delete_files_batch.assert_called_once()
        prisma.scene.delete_many.assert_called_once_with(where={"userId": "user-1"})

    async def test_no_scenes_returns_count_zero_without_s3_call(self, app):
        """TC-47: User has no scenes → deletedCount=0, S3 never called."""
        ps, prisma = _prisma_ctx(scenes=[])
        s3 = _s3_ctx()

        with patch("src.routes.scenes.PrismaService", return_value=ps), \
             patch("src.routes.scenes.S3Service", return_value=s3):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.delete("/scenes/user/user-empty")

        assert resp.status_code == 200
        assert resp.json()["deletedCount"] == 0
        s3.delete_files_batch.assert_not_called()
        prisma.scene.delete_many.assert_not_called()

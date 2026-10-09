import asyncio
import logging
import os
import shutil
import tempfile
from datetime import datetime, timezone

from ragspace.common.v1 import common_pb2
from ragspace.events.v1 import events_pb2
from ragspace_shared.protos import enum_name

from src.config.settings import settings
from src.decorators.cpu_manager import cpu_executor
from src.events import event_bus, report_stage
from src.services.prisma_service import PrismaService
from src.services.s3_service import S3Service
from src.services.scene_detection_service import SceneDetectionService
from src.services.youtube_downloader_service import YouTubeDownloaderService

logger = logging.getLogger(__name__)

VIDEO_TYPES = {"VIDEO", "YOUTUBE_VIDEO"}
PROGRESS_STEP = 5
SCENE_DETECTION = common_pb2.PROCESSING_STAGE_SCENE_DETECTION
INDEXING = common_pb2.PROCESSING_STAGE_INDEXING
COMPLETED_STAGE = common_pb2.PROCESSING_STAGE_COMPLETED
IN_PROGRESS = common_pb2.PROCESSING_STATUS_IN_PROGRESS
COMPLETED = common_pb2.PROCESSING_STATUS_COMPLETED
FAILED = common_pb2.PROCESSING_STATUS_FAILED


class SceneProcessor:
    def __init__(self) -> None:
        self.s3 = S3Service()
        self.detector = SceneDetectionService()
        self.youtube = YouTubeDownloaderService()
        self.db = PrismaService()
        os.makedirs(settings.temp_dir, exist_ok=True)

    async def process(self, upload: events_pb2.FileUploaded, is_final_attempt: bool = True) -> None:
        file_id, user_id = upload.file_id, upload.user_id
        file_type = enum_name(common_pb2.FileType, "FILE_TYPE", upload.type) or ""
        is_video = file_type in VIDEO_TYPES
        work_dir: str | None = None
        try:
            await self.db.ensure_connected()
            if is_video:
                await self._clear_scenes(file_id)
                await report_stage(file_id, user_id, stage=SCENE_DETECTION, status=IN_PROGRESS, progress=0)

            work_dir = tempfile.mkdtemp(dir=settings.temp_dir)
            file_path = os.path.join(work_dir, os.path.basename(upload.key) or f"{file_id}.bin")
            await self._fetch_source(upload, file_path)

            thumbnail_key = await self._upload_file_thumbnail(upload, file_type, file_path, work_dir)
            if thumbnail_key:
                await report_stage(file_id, user_id, thumbnail_key=thumbnail_key)
            if not is_video:
                return

            scenes = await self._detect_scenes(upload, file_path)
            if not scenes:
                await report_stage(
                    file_id, user_id, stage=COMPLETED_STAGE, status=COMPLETED, attributes={"scenesDetected": 0}
                )
                return

            stored, failed = await self._store_scenes(upload, scenes, file_path, work_dir)
            attributes: dict = {"scenesDetected": stored, "scenesTotal": len(scenes)}
            if failed:
                attributes["scenesFailed"] = failed
            await report_stage(file_id, user_id, stage=INDEXING, status=IN_PROGRESS, attributes=attributes)
            await event_bus.publish(
                "file_scenes_detected",
                events_pb2.FileScenesDetected(file_id=file_id, user_id=user_id, type=upload.type, scene_count=stored),
            )
            logger.info("Scene detection finished for %s: %d scenes", file_id, stored)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.error("Scene processing failed for %s: %s", file_id, error, exc_info=True)
            if is_final_attempt:
                await report_stage(file_id, user_id, stage=SCENE_DETECTION, status=FAILED, error=str(error))
            raise
        finally:
            if work_dir:
                shutil.rmtree(work_dir, ignore_errors=True)

    async def _clear_scenes(self, file_id: str) -> None:
        deleted = await self.db.prisma.scene.delete_many(where={"fileId": file_id})
        if deleted:
            logger.info("Removed %d previous scenes for %s", deleted, file_id)

    async def _fetch_source(self, upload: events_pb2.FileUploaded, file_path: str) -> None:
        if not upload.youtube_url:
            await self.s3.download_file(upload.key, file_path, bucket=upload.bucket or None)
            return
        result = await self.youtube.download_video(upload.youtube_url, file_path)
        attributes = {
            "durationSeconds": int(result["duration"]) if result.get("duration") else None,
            "uploader": result.get("uploader"),
            "description": (result.get("description") or "")[:2000] or None,
            "downloadedAt": datetime.now(timezone.utc).isoformat(),
        }
        await report_stage(
            upload.file_id,
            upload.user_id,
            name=result.get("title"),
            size_bytes=result.get("file_size"),
            attributes={key: value for key, value in attributes.items() if value is not None},
        )

    async def _upload_file_thumbnail(
        self, upload: events_pb2.FileUploaded, file_type: str, file_path: str, work_dir: str
    ) -> str | None:
        try:
            local_path = os.path.join(work_dir, f"thumbnail_{upload.file_id}.jpg")
            await self.detector.generate_file_thumbnail(file_path, file_type, local_path)
            now = datetime.now(timezone.utc)
            key = f"thumbnails/{upload.user_id}/{now.year}/{now.month}/files/{upload.file_id}.jpg"
            await self.s3.upload_file(local_path, key, content_type="image/jpeg", bucket=upload.bucket or None)
            return key
        except Exception as error:
            logger.warning("File thumbnail failed for %s: %s", upload.file_id, error)
            return None

    async def _detect_scenes(self, upload: events_pb2.FileUploaded, file_path: str) -> list[dict]:
        loop = asyncio.get_running_loop()
        reporter = _ProgressReporter(upload.file_id, upload.user_id)

        def on_progress(pct: int) -> None:
            asyncio.run_coroutine_threadsafe(reporter.report(pct // 2), loop)

        return await loop.run_in_executor(
            cpu_executor, lambda: self.detector.detect_scenes(file_path, progress_callback=on_progress)
        )

    async def _store_scenes(
        self, upload: events_pb2.FileUploaded, scenes: list[dict], file_path: str, work_dir: str
    ) -> tuple[int, int]:
        reporter = _ProgressReporter(upload.file_id, upload.user_id, floor=50)
        now = datetime.now(timezone.utc)
        done = 0
        lock = asyncio.Lock()

        async def one(scene: dict) -> dict | None:
            nonlocal done
            row = await self._thumbnail_scene(upload, scene, file_path, work_dir, now)
            async with lock:
                done += 1
                progress = 50 + round(done / len(scenes) * 50)
            await reporter.report(progress)
            return row

        rows = await asyncio.gather(*(one(scene) for scene in scenes))
        created = [row for row in rows if row]
        if not created:
            raise RuntimeError(f"All {len(scenes)} scene thumbnails failed for {upload.file_id}")
        await self.db.prisma.scene.create_many(data=created)
        return len(created), len(scenes) - len(created)

    async def _thumbnail_scene(
        self, upload: events_pb2.FileUploaded, scene: dict, file_path: str, work_dir: str, now: datetime
    ) -> dict | None:
        number = scene["scene_number"]
        try:
            local_path = os.path.join(work_dir, f"scene_{number:04d}.jpg")
            await self.detector.extract_thumbnail(file_path, scene["keyframe"], local_path)
            key = f"thumbnails/{upload.user_id}/{now.year}/{now.month}/scenes/{upload.file_id}/scene_{number:04d}.jpg"
            await self.s3.upload_file(local_path, key, content_type="image/jpeg", bucket=upload.bucket or None)
            return {
                "fileId": upload.file_id,
                "userId": upload.user_id,
                "sceneNumber": number,
                "startTime": scene["start_time"],
                "endTime": scene["end_time"],
                "startFrame": scene["start_frame"],
                "endFrame": scene["end_frame"],
                "keyframe": scene["keyframe"],
                "duration": scene["duration"],
                "thumbnailS3Key": key,
            }
        except Exception as error:
            logger.warning("Scene %d thumbnail failed for %s: %s", number, upload.file_id, error)
            return None


class _ProgressReporter:
    def __init__(self, file_id: str, user_id: str, floor: int = 0) -> None:
        self.file_id = file_id
        self.user_id = user_id
        self.last = floor - PROGRESS_STEP

    async def report(self, pct: int) -> None:
        if pct < 100 and pct - self.last < PROGRESS_STEP:
            return
        self.last = pct
        try:
            await report_stage(self.file_id, self.user_id, stage=SCENE_DETECTION, status=IN_PROGRESS, progress=pct)
        except Exception as error:
            logger.debug("Progress report dropped for %s: %s", self.file_id, error)

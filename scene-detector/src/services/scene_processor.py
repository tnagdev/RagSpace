import logging
import os
import tempfile
import shutil
from datetime import datetime
from src.config.settings import settings
from src.rabbitmq.rabbitmq_producer import RabbitMQProducer
from src.services.upload_manager_client import UploadManagerClient
from src.models.enums import EventType, ProcessingStage, ProcessingStatus
from src.models.events import UploadCompletedEventModel, UpdateFileStatusParams
from src.services.s3_service import S3Service
from src.services.prisma_service import PrismaService
from src.services.scene_detection_service import SceneDetectionService
from src.services.youtube_downloader_service import YouTubeDownloaderService
from src.decorators.cpu_manager import cpu_executor
from src.utils.correlation import correlation_id_var
import asyncio

logger = logging.getLogger(__name__)


class SceneProcessor:
    """Service for processing video files and detecting scenes"""

    def __init__(self, user, session):
        self.temp_dir = settings.temp_dir
        self.rabbitmq_service = RabbitMQProducer()
        self.upload_manager_client = UploadManagerClient(user, session)
        self.s3_service = S3Service()
        self.scene_detection_service = SceneDetectionService()
        self.youtube_downloader = YouTubeDownloaderService()
        self.prisma_service = PrismaService()
        os.makedirs(self.temp_dir, exist_ok=True)

    async def _publish_progress_pct(
        self, file_id: str, user_id: str, pct: int
    ) -> None:
        """Publish a raw progress percentage for the SCENE_DETECTION stage."""
        try:
            await self.rabbitmq_service.publish_event(
                EventType.PROCESSING_PROGRESS.value,
                {
                    'type': EventType.PROCESSING_PROGRESS.value,
                    'fileId': file_id,
                    'userId': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                    'data': {
                        'stage': ProcessingStage.SCENE_DETECTION.value,
                        'progress': pct,
                    }
                }
            )
        except Exception as pub_err:
            logger.warning(f"Failed to publish progress event: {pub_err}")

    async def _publish_scene_progress(
        self, file_id: str, user_id: str, completed: int, total: int
    ) -> None:
        pct = round((completed / total) * 100) if total else 100
        await self._publish_progress_pct(file_id, user_id, pct)

    async def _process_single_scene(
        self,
        scene_data: dict,
        file_id: str,
        user_id: str,
        year: int,
        month: int,
        work_dir: str,
        scene_bucket: str,
        file_path: str,
    ) -> dict:
        """Process a single scene asynchronously — extract thumbnail and upload to S3."""
        scene_number = scene_data['scene_number']
        try:
            thumbnail_filename = f"scene_{scene_number:04d}.jpg"
            thumbnail_path = os.path.join(work_dir, thumbnail_filename)

            await self.scene_detection_service.extract_thumbnail(
                file_path,
                scene_data['keyframe'],
                thumbnail_path
            )

            thumbnail_s3_key = (
                f"thumbnails/{user_id}/{year}/{month}/scenes/"
                f"{file_id}/scene_{scene_number:04d}.jpg"
            )

            await self.s3_service.upload_file(
                thumbnail_path,
                thumbnail_s3_key,
                content_type='image/jpeg',
                bucket=scene_bucket
            )

            thumbnail_url = await self.s3_service.get_signed_url(
                thumbnail_s3_key,
                expiration=3600,  # 1 hour
                bucket=scene_bucket
            )

            return {
                'fileId': file_id,
                'userId': user_id,
                'sceneNumber': scene_number,
                'startTime': scene_data['start_time'],
                'endTime': scene_data['end_time'],
                'startFrame': scene_data['start_frame'],
                'endFrame': scene_data['end_frame'],
                'keyframe': scene_data['keyframe'],
                'duration': scene_data['duration'],
                'thumbnailS3Key': thumbnail_s3_key,
                'thumbnailS3Url': thumbnail_url
            }
        except Exception as e:
            logger.error(
                f"Error processing scene {scene_number}: {e}",
                exc_info=True
            )
            return {"_failed": True, "scene_number": scene_number, "error": str(e)}

    async def process_file(
        self,
        file_id: str,
        event_data: UploadCompletedEventModel,
        is_final_attempt: bool = True,
    ):
        work_dir = None
        correlation_id = correlation_id_var.get()
        try:
            user = event_data.user
            user_id = user.id if user else None

            logger.info(f"[{correlation_id}] Starting processing for file: {file_id} (user: {user_id})")

            file_record = await self.upload_manager_client.get_file(file_id)
            if not file_record:
                raise Exception(f"File not found: {file_id}")

            # ── Idempotency: delete any previously created scenes so a reprocess
            # never leaves duplicate rows (create_many would duplicate on retry).
            existing_count = await self.prisma_service.prisma.scene.count(
                where={'fileId': file_id}
            )
            if existing_count > 0:
                await self.prisma_service.prisma.scene.delete_many(
                    where={'fileId': file_id}
                )
                logger.info(f"[{correlation_id}] Deleted {existing_count} existing scenes for reprocess of {file_id}")

            file_type = file_record.get('fileType', '').upper()

            await self.upload_manager_client.update_file_status(
                file_id,
                UpdateFileStatusParams(
                    processingStatus=ProcessingStatus.IN_PROGRESS.value,
                    processingStage=ProcessingStage.SCENE_DETECTION.value,
                    processingStartedAt=datetime.utcnow()
                )
            )

            await self.rabbitmq_service.publish_event(
                EventType.PROCESSING_STARTED.value,
                {
                    'type': EventType.PROCESSING_STARTED.value,
                    'fileId': file_id,
                    'userId': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                    'data': {
                        'stage': ProcessingStage.SCENE_DETECTION.value
                    }
                }
            )

            work_dir = tempfile.mkdtemp(dir=self.temp_dir)
            logger.info(f"Created work directory: {work_dir}")

            year = datetime.utcnow().year
            month = datetime.utcnow().month

            filename = os.path.basename(file_record['s3Key'])
            file_path = os.path.join(work_dir, filename)

            loop = asyncio.get_event_loop()

            # Check if this is a YouTube video
            youtube_url = file_record.get('youtubeUrl')
            if youtube_url:
                logger.info(f"Downloading YouTube video: {youtube_url}")
                download_result = await self.youtube_downloader.download_video(
                    youtube_url,
                    file_path,
                )

                youtube_metadata = dict(file_record.get('metadata') or {})
                # Only set keys that aren't already present (preserve submission-time metadata)
                for key, value in {
                    'actualFileSize': download_result['file_size'],
                    'downloadedAt': datetime.utcnow().isoformat(),
                    'downloadedTitle': download_result.get('title'),
                    'downloadedDuration': download_result.get('duration'),
                    'description': download_result.get('description', ''),
                }.items():
                    youtube_metadata.setdefault(key, value)
                if download_result.get('duration'):
                    youtube_metadata['duration'] = int(download_result['duration'])

                video_title = download_result.get('title', file_record.get('filename', 'video'))
                safe_filename = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in video_title)
                safe_filename = safe_filename[:100]

                await self.upload_manager_client.update_file_status(
                    file_id,
                    UpdateFileStatusParams(
                        filename=f"{safe_filename}.mp4",
                        originalFilename=video_title,
                        fileSize=download_result['file_size'],
                        metadata=youtube_metadata
                    )
                )

                logger.info(f"✓ YouTube video downloaded: {download_result['title']}")
            else:
                await self.s3_service.download_file(
                    file_record['s3Key'],
                    file_path,
                    bucket=file_record.get('s3Bucket', 'user-uploads')
                )

            # Generate and upload file thumbnail
            thumbnail_path = None
            try:
                thumbnail_filename = f"thumbnail_{file_id}.jpg"
                thumbnail_local_path = os.path.join(work_dir, thumbnail_filename)

                await self.scene_detection_service.generate_file_thumbnail(
                    file_path,
                    file_type,
                    thumbnail_local_path
                )

                thumbnail_s3_key = f"thumbnails/{user_id}/{year}/{month}/files/{file_id}.jpg"

                bucket = file_record.get('s3Bucket') or settings.aws_s3_bucket
                await self.s3_service.upload_file(
                    thumbnail_local_path,
                    thumbnail_s3_key,
                    content_type='image/jpeg',
                    bucket=bucket
                )

                # Generate presigned URL for private bucket access
                thumbnail_url = await self.s3_service.get_signed_url(
                    thumbnail_s3_key,
                    expiration=3600,  # 1 hour
                    bucket=bucket
                )

                logger.info(f"Generated and uploaded file thumbnail to bucket '{bucket}': {thumbnail_s3_key}")

                # Update file record with thumbnail path (S3 key)
                await self.upload_manager_client.update_file_status(
                    file_id,
                    UpdateFileStatusParams(
                        metadata={
                            'thumbnailPath': thumbnail_s3_key
                        }
                    )
                )

            except Exception as thumb_error:
                logger.error(f"Failed to generate file thumbnail: {thumb_error}", exc_info=True)

            if file_type not in ['VIDEO', 'YOUTUBE_VIDEO']:
                logger.info(f"Skipping scene detection for non-video file type: {file_type}")
                result = await self.upload_manager_client.update_file_status(
                    file_id,
                    UpdateFileStatusParams(
                        processingStatus=ProcessingStatus.COMPLETED.value,
                        processingStage=ProcessingStage.COMPLETED.value,
                        processingCompletedAt=datetime.utcnow()
                    )
                )
                # Images finish here (no scene-detection/indexing phase follows).
                # Publish so upload-manager's WS broadcaster (bound to routing key
                # `file.#`) pushes the COMPLETED state to the frontend immediately —
                # without this, the UI only updates on manual refresh. Uses
                # INDEXING_COMPLETED, not PROCESSING_COMPLETED: the latter is
                # strictly schema-validated by file-embedder's video-scene consumer
                # (requires a scenes[] array) and would risk purging this image's
                # already-correct embeddings. INDEXING_COMPLETED has no registered
                # consumers, so it's a safe "pipeline reached COMPLETED" signal for
                # upload-manager's WS broadcaster only.
                try:
                    await self.rabbitmq_service.publish_event(
                        EventType.INDEXING_COMPLETED.value,
                        {
                            'type': EventType.INDEXING_COMPLETED.value,
                            'fileId': file_id,
                            'userId': user_id,
                            'timestamp': datetime.utcnow().isoformat(),
                            'data': {'stage': ProcessingStage.COMPLETED.value},
                        }
                    )
                except Exception as pub_err:
                    logger.warning(f"Failed to publish indexing-completed event for image {file_id}: {pub_err}")
                return result

            # Build a sync callback that schedules async progress publishes from the
            # executor thread (0-49% range = frame analysis phase).
            def _on_detect_progress(pct: int) -> None:
                asyncio.run_coroutine_threadsafe(
                    self._publish_progress_pct(file_id, user_id, pct),
                    loop,
                )

            scenes_data = await loop.run_in_executor(
                cpu_executor,
                lambda: self.scene_detection_service.detect_scenes(
                    file_path, progress_callback=_on_detect_progress
                ),
            )

            if not scenes_data:
                logger.warning(f"No scenes detected in file: {file_id}")
                return await self.upload_manager_client.update_file_status(
                    file_id,
                    UpdateFileStatusParams(
                        processingStatus=ProcessingStatus.COMPLETED.value,
                        processingStage=ProcessingStage.COMPLETED.value,
                        processingCompletedAt=datetime.utcnow(),
                        metadata={'scenes_detected': 0}
                    )
                )

            logger.info(f"[{correlation_id}] Detected {len(scenes_data)} scenes, processing thumbnails...")

            scene_bucket = file_record.get('s3Bucket') or settings.aws_s3_bucket
            total_scenes = len(scenes_data)
            completed_scenes = 0
            progress_lock = asyncio.Lock()

            async def _run_with_progress(scene_data):
                nonlocal completed_scenes
                result = await self._process_single_scene(
                    scene_data, file_id, user_id, year, month, work_dir, scene_bucket, file_path
                )
                async with progress_lock:
                    completed_scenes += 1
                    done = completed_scenes
                # Thumbnail phase maps to 50-100% so the full bar goes 0→50 (detection)
                # then 50→100 (thumbnail extraction + S3 upload).
                pct = 50 + round(done / total_scenes * 50)
                await self._publish_progress_pct(file_id, user_id, pct)
                logger.info(f"Processed scene {scene_data['scene_number']}/{total_scenes}")
                return result

            results = await asyncio.gather(*[_run_with_progress(sd) for sd in scenes_data])

            scenes_to_create = [s for s in results if s is not None and not s.get("_failed")]
            failed_scenes = [s for s in results if s is not None and s.get("_failed")]
            if failed_scenes:
                logger.warning(
                    f"Failed to process {len(failed_scenes)} scenes: "
                    f"{[s['scene_number'] for s in failed_scenes]}"
                )

            if not scenes_to_create and scenes_data:
                raise RuntimeError(
                    f"All {len(failed_scenes)}/{len(scenes_data)} scene thumbnail uploads failed "
                    f"for {file_id}. Check S3 connectivity."
                )

            if scenes_to_create:
                logger.info(f"Batch inserting {len(scenes_to_create)} scenes into database...")
                await self.prisma_service.prisma.scene.create_many(
                    data=scenes_to_create
                )
                logger.info(f"Successfully inserted {len(scenes_to_create)} scenes")

                # Fetch created scenes to get their IDs
                created_scenes = await self.prisma_service.prisma.scene.find_many(
                    where={'fileId': file_id},
                    order={'sceneNumber': 'asc'}
                )
                # Create a lookup by sceneNumber for easy ID mapping
                scene_id_map = {scene.sceneNumber: scene.id for scene in created_scenes}

            indexing_metadata: dict = {
                'scenes_detected': len(scenes_to_create),
                'scenes_total': len(scenes_data)
            }
            if failed_scenes:
                indexing_metadata['scenes_failed'] = len(failed_scenes)
                indexing_metadata['failed_scene_numbers'] = [s['scene_number'] for s in failed_scenes]

            await self.upload_manager_client.update_file_status(
                file_id,
                UpdateFileStatusParams(
                    processingStatus=ProcessingStatus.IN_PROGRESS.value,
                    processingStage=ProcessingStage.INDEXING.value,
                    metadata=indexing_metadata,
                )
            )

            await self.rabbitmq_service.publish_event(
                EventType.PROCESSING_COMPLETED.value,
                {
                    'type': EventType.PROCESSING_COMPLETED.value,
                    'fileId': file_id,
                    'fileName': file_record.get('originalFilename') or file_record.get('filename'),
                    'fileType': file_record.get('fileType'),
                    'user': user.model_dump(by_alias=True) if hasattr(user, 'model_dump') else user,
                    'timestamp': datetime.utcnow().isoformat(),
                    'data': {
                        'stage': ProcessingStage.SCENE_DETECTION.value,
                        'scenes_detected': len(scenes_to_create),
                        'scenes': [
                            {
                                'id': scene_id_map.get(scene['sceneNumber']),
                                'sceneNumber': scene['sceneNumber'],
                                'keyframe': scene['keyframe'],
                                'startFrame': scene['startFrame'],
                                'endFrame': scene['endFrame'],
                                'startTime': scene['startTime'],
                                'endTime': scene['endTime'],
                                'thumbnailUrl': scene['thumbnailS3Url'],
                                'thumbnailS3Key': scene['thumbnailS3Key']
                            }
                            for scene in scenes_to_create
                        ]
                    }
                }
            )

            logger.info(
                f"[{correlation_id}] Scene processing completed for file: {file_id}, "
                f"created {len(scenes_to_create)} scenes"
            )

        except Exception as e:
            logger.error(f"[{correlation_id}] Error processing file {file_id}: {e}", exc_info=True)
            if is_final_attempt:
                try:
                    await self.upload_manager_client.update_file_status(
                        file_id,
                        UpdateFileStatusParams(
                            processingStatus=ProcessingStatus.FAILED.value,
                            processingCompletedAt=datetime.utcnow(),
                            errorMessage=str(e)
                        )
                    )

                    await self.rabbitmq_service.publish_event(
                        EventType.PROCESSING_FAILED.value,
                        {
                            'type': EventType.PROCESSING_FAILED.value,
                            'fileId': file_id,
                            'userId': user_id,
                            'timestamp': datetime.utcnow().isoformat(),
                            'data': {
                                'stage': ProcessingStage.SCENE_DETECTION.value,
                                'error': str(e)
                            }
                        }
                    )
                except Exception as update_error:
                    logger.error(f"Failed to update error status: {update_error}")

            raise

        finally:
            if work_dir and os.path.exists(work_dir):
                try:
                    shutil.rmtree(work_dir)
                    logger.info(f"Cleaned up work directory: {work_dir}")
                except Exception as e:
                    logger.error(f"Failed to clean up work directory: {e}")

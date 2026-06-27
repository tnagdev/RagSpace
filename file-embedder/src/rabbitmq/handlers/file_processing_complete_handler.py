import logging
import os
import tempfile
import shutil
import asyncio
from datetime import datetime
from src.models.enums import EventType, FileType, ProcessingStatus, ProcessingStage
from src.models.events import ProcessingCompletedEventModel
from src.config import settings
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.S3ClientService import S3ClientService
from src.services.UploadManagerService import UploadManagerService
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.rabbitmq.publisher import publish_event
from src.decorators.cpu_manager import cpu_executor
from src.utils.background_tasks import background_task_manager
from src.utils.deletion_tracker import is_deleted


logger = logging.getLogger(__name__)

_RETRY_BACKOFF_SECONDS = [5, 15, 45]


def _delete_existing_embeddings(chroma_db, file_id: str) -> None:
    """Purge scene embeddings before reprocess. Audio segments are managed by the UPLOAD handler."""
    # Image collection: all entries for this file are scene visuals — delete all
    chroma_db.image_collection.delete(where={"file_id": file_id})
    logger.info(f"Purged existing visual embeddings from {chroma_db.image_index_name} for {file_id}")

    # Text collection: only delete SCENE items (have scene_index in metadata).
    # Audio segments (have segment_index in metadata) are owned by the UPLOAD handler.
    chroma_db.text_collection.delete(
        where={"$and": [{"file_id": file_id}, {"scene_index": {"$gte": 0}}]}
    )
    logger.info(f"Purged existing scene text embeddings from {chroma_db.text_index_name} for {file_id}")


async def _publish_indexing_progress(file_id: str, user_id: str, done: int, total: int) -> None:
    pct = round((done / total) * 100) if total else 100
    try:
        await publish_event(
            EventType.PROCESSING_PROGRESS.value,
            {
                'type': EventType.PROCESSING_PROGRESS.value,
                'fileId': file_id,
                'userId': user_id,
                'timestamp': datetime.utcnow().isoformat(),
                'data': {
                    'stage': ProcessingStage.INDEXING.value,
                    'progress': pct,
                }
            }
        )
    except Exception as pub_err:
        logger.warning(f"Failed to publish indexing progress: {pub_err}")


def _match_scene_transcript(
    scene_start: float,
    scene_end: float,
    audio_segments: list,
) -> str | None:
    """Return joined text of all audio segments that overlap [scene_start, scene_end].

    The same segment can match multiple scenes (subtitle semantics): a sentence
    spoken across a scene boundary appears in every overlapping scene.
    """
    matched = [
        s for s in audio_segments
        if s.get("start_time", 0) <= scene_end and s.get("end_time", 0) >= scene_start
    ]
    if not matched:
        return None
    matched.sort(key=lambda s: s.get("start_time", 0))
    joined = " ".join(s["text"] for s in matched if s.get("text", "").strip()).strip()
    return joined or None


async def _process_scenes_in_background(event_data: ProcessingCompletedEventModel):
    """Process scenes with CPU-intensive operations using singleton models."""
    temp_dir = None
    try:
        s3_client = S3ClientService()
        video_embedder = VideoEmbedderService()
        chroma_db = ChromaDatabaseManager()
        upload_manager = UploadManagerService(event_data.user, event_data.session)

        data = event_data.data
        file_id = event_data.fileId
        user_id = event_data.user.id
        scenes = data.scenes
        original_name = event_data.fileName

        if not file_id:
            logger.error("No file ID in processing completed event")
            return

        if not scenes:
            logger.warning(f"No scenes found for {file_id}, marking as COMPLETED")
            await upload_manager.update_file_status(
                file_id=file_id,
                processing_status=ProcessingStatus.COMPLETED.value,
                processing_stage=ProcessingStage.COMPLETED.value,
            )
            await publish_event(
                EventType.INDEXING_COMPLETED.value,
                {
                    'type': EventType.INDEXING_COMPLETED.value,
                    'fileId': file_id,
                    'userId': user_id,
                    'timestamp': datetime.utcnow().isoformat(),
                    'data': {'stage': ProcessingStage.COMPLETED.value},
                }
            )
            return

        try:
            _delete_existing_embeddings(chroma_db, file_id)
        except Exception as del_err:
            logger.warning(f"Could not purge existing embeddings for {file_id}: {del_err}")

        # Fetch pre-computed audio segments from the UPLOAD phase for timestamp matching.
        # Filter directly for items with segment_index in metadata (audio segments only).
        _audio_raw = chroma_db.text_collection.get(
            where={"$and": [{"file_id": file_id}, {"segment_index": {"$gte": 0}}]},
            include=["metadatas", "documents"],
        )
        audio_segments: list = []
        for _meta, _doc in zip(
            _audio_raw.get("metadatas", []),
            _audio_raw.get("documents", []),
        ):
            if _meta.get("start_time") is not None:
                audio_segments.append({**_meta, "text": _doc or ""})
        audio_segments.sort(key=lambda s: s.get("start_time", 0))
        if audio_segments:
            logger.info(f"Loaded {len(audio_segments)} audio segments for scene matching ({file_id})")
        else:
            logger.warning(
                f"No pre-computed audio segments found for {file_id}; scenes will use OCR text only"
            )

        dir_path = os.path.join(settings.temp_dir, file_id, 'scene')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        visual_items = []
        text_items = []
        metadata_items = []
        total_scenes = len(scenes)
        completed_scenes = 0
        descriptions_attempted = 0
        descriptions_succeeded = 0
        failed_count = 0
        llm_configured = bool(settings.nvidia_api_key)
        abort_event = asyncio.Event()
        progress_lock = asyncio.Lock()
        semaphore = asyncio.Semaphore(settings.max_concurrent_scenes)

        # Backoff delays between per-scene retries (indexed by attempt number, 0-based)
        _SCENE_RETRY_DELAYS = [1, 3]

        async def process_scene(i, scene):
            nonlocal completed_scenes, descriptions_attempted, descriptions_succeeded, failed_count

            # Fast-fail: abort was already triggered by a previous scene's failure cascade
            if abort_event.is_set():
                return None, None, None

            async with semaphore:
                thumbnail_url = scene.thumbnailUrl
                thumbnail_s3_key = scene.thumbnailS3Key
                scene_id = scene.id

                if not thumbnail_url:
                    logger.warning(f"No thumbnail URL for scene {i}, skipping")
                    async with progress_lock:
                        completed_scenes += 1
                        done = completed_scenes
                    await _publish_indexing_progress(file_id, user_id, done, total_scenes)
                    return None, None, None

                loop = asyncio.get_running_loop()
                thumbnail_path = os.path.join(temp_dir, f"scene_{i}.jpg")
                last_exc: Exception | None = None

                for attempt in range(settings.max_scene_retries + 1):
                    if abort_event.is_set():
                        return None, None, None
                    try:
                        await s3_client.download(
                            s3_url=thumbnail_url,
                            s3_key=thumbnail_s3_key,
                            local_path=thumbnail_path,
                        )

                        visual_embedding = await loop.run_in_executor(
                            cpu_executor, video_embedder.embed_image, thumbnail_path
                        )
                        await asyncio.sleep(0)

                        # OCR: always run — captures on-screen text in the frame
                        ocr_text = await loop.run_in_executor(
                            cpu_executor, video_embedder.extract_text, thumbnail_path
                        )

                        # Transcript: full-audio segments matched by timestamp overlap
                        transcript = _match_scene_transcript(
                            scene.startTime, scene.endTime, audio_segments
                        )

                        # Primary search text: transcript preferred (richer semantics);
                        # fall back to OCR for silent scenes or when audio not yet indexed
                        search_text = transcript or ocr_text

                        logger.info(
                            f"Scene {i} [{scene.startTime:.2f}s – {scene.endTime:.2f}s] | "
                            f"OCR: {repr(ocr_text or '(none)')} | "
                            f"Transcript: {repr(transcript or '(none)')}"
                        )

                        text_embedding = None
                        if search_text:
                            await asyncio.sleep(0)
                            text_embedding = await loop.run_in_executor(
                                cpu_executor, video_embedder.embed_text, search_text
                            )

                        metadata_item = None
                        if llm_configured:
                            try:
                                description = await asyncio.wait_for(
                                    video_embedder.generate_image_description(thumbnail_path),
                                    timeout=settings.llm_request_timeout * 3 + 30,
                                )
                                if description and scene_id:
                                    metadata_item = {
                                        "file_id": file_id,
                                        "source_type": "SCENE",
                                        "description": description,
                                        "scene_id": scene_id,
                                    }
                                async with progress_lock:
                                    descriptions_attempted += 1
                                    if description:
                                        descriptions_succeeded += 1
                                    else:
                                        logger.warning(f"LLM returned no description for scene {i}")
                            except asyncio.TimeoutError:
                                logger.error(f"LLM API timed out for scene {i}")
                                async with progress_lock:
                                    descriptions_attempted += 1
                            except Exception as e:
                                logger.error(f"LLM API failed for scene {i}: {e}")
                                async with progress_lock:
                                    descriptions_attempted += 1

                        visual_item = {
                            "chunk_id": f"{file_id}#scene_{i}",
                            "scene_index": i,
                            "file_id": file_id,
                            "user_id": user_id,
                            "file_type": FileType.VIDEO,
                            "file_name": original_name,
                            "vector": visual_embedding,
                            "scene_number": scene.sceneNumber,
                            "start_frame": scene.startFrame,
                            "end_frame": scene.endFrame,
                            "start_time": scene.startTime,
                            "end_time": scene.endTime,
                            "keyframe": scene.keyframe,
                            "thumbnail_s3_key": thumbnail_s3_key,
                            "text": search_text,
                            "ocr_text": ocr_text or "",
                            "transcript": transcript or "",
                        }

                        text_item = None
                        if text_embedding is not None:
                            text_item = {
                                "chunk_id": f"{file_id}#scene_{i}#text",
                                "scene_index": i,
                                "file_id": file_id,
                                "user_id": user_id,
                                "file_type": FileType.VIDEO,
                                "file_name": original_name,
                                "vector": text_embedding,
                                "scene_number": scene.sceneNumber,
                                "start_frame": scene.startFrame,
                                "end_frame": scene.endFrame,
                                "start_time": scene.startTime,
                                "end_time": scene.endTime,
                                "keyframe": scene.keyframe,
                                "thumbnail_s3_key": thumbnail_s3_key,
                                "text": search_text,
                                "ocr_text": ocr_text or "",
                                "transcript": transcript or "",
                            }

                        async with progress_lock:
                            completed_scenes += 1
                            done = completed_scenes
                        await _publish_indexing_progress(file_id, user_id, done, total_scenes)
                        return visual_item, text_item, metadata_item

                    except FileNotFoundError as e:
                        # Permanent — thumbnail key missing; no point retrying
                        logger.error(f"Scene {i} thumbnail not found (permanent): {e}")
                        last_exc = e
                        break
                    except (OSError, IOError) as e:
                        # Transient network / disk error — retry with backoff
                        last_exc = e
                        if attempt < settings.max_scene_retries:
                            delay = _SCENE_RETRY_DELAYS[min(attempt, len(_SCENE_RETRY_DELAYS) - 1)]
                            logger.warning(
                                f"Scene {i} transient error (attempt {attempt + 1}/"
                                f"{settings.max_scene_retries + 1}), retrying in {delay}s: {e}"
                            )
                            await asyncio.sleep(delay)
                        else:
                            logger.error(f"Scene {i} failed after {settings.max_scene_retries + 1} attempts: {e}")
                            break
                    except Exception as e:
                        # Unknown — retry once, then give up
                        last_exc = e
                        if attempt < settings.max_scene_retries:
                            delay = _SCENE_RETRY_DELAYS[min(attempt, len(_SCENE_RETRY_DELAYS) - 1)]
                            logger.warning(
                                f"Scene {i} unexpected error (attempt {attempt + 1}/"
                                f"{settings.max_scene_retries + 1}), retrying in {delay}s: {e}"
                            )
                            await asyncio.sleep(delay)
                        else:
                            logger.error(f"Scene {i} failed after {settings.max_scene_retries + 1} attempts: {e}")
                            break

                # Scene exhausted all retries — count failure and check abort threshold
                async with progress_lock:
                    failed_count += 1
                    completed_scenes += 1
                    done = completed_scenes
                    current_failed = failed_count

                exceeded_ratio = (
                    total_scenes > 0
                    and current_failed / total_scenes > settings.scene_failure_threshold_ratio
                )
                exceeded_count = current_failed >= settings.scene_failure_threshold_count
                if exceeded_ratio or exceeded_count:
                    logger.error(
                        f"Abort threshold reached: {current_failed}/{total_scenes} scenes failed "
                        f"for {file_id} — cancelling remaining scenes"
                    )
                    abort_event.set()

                await _publish_indexing_progress(file_id, user_id, done, total_scenes)
                return None, None, None

        results = await asyncio.gather(
            *[process_scene(i, scene) for i, scene in enumerate(scenes)],
            return_exceptions=True
        )

        for result in results:
            if result and not isinstance(result, Exception):
                visual_item, text_item, metadata_item = result
                if visual_item:
                    visual_items.append(visual_item)
                if text_item:
                    text_items.append(text_item)
                if metadata_item:
                    metadata_items.append(metadata_item)

        # If the abort threshold was triggered (too many scenes failed with retries),
        # raise now so the file-level retry loop handles it (→ FAILED after max retries).
        if abort_event.is_set():
            raise RuntimeError(
                f"Scene processing aborted: {failed_count}/{total_scenes} scenes failed "
                f"for {file_id}"
            )

        # If LLM is configured but every description attempt failed, the API is
        # unavailable. Raising here causes the retry loop to re-attempt later;
        # after max retries the file is marked FAILED so the user can see the error.
        if llm_configured and descriptions_attempted > 0 and descriptions_succeeded == 0:
            raise RuntimeError(
                f"LLM API unavailable — all {descriptions_attempted} scene description "
                f"attempts failed for {file_id}"
            )

        if is_deleted(file_id):
            logger.info(f"File {file_id} deleted during scene indexing — discarding results")
            return

        if visual_items:
            chroma_db.upsert_items(chroma_db.image_index_name, visual_items)
            logger.info(f"Successfully embedded {len(visual_items)} visual embeddings for {file_id}")

        if text_items:
            chroma_db.upsert_items(chroma_db.text_index_name, text_items)
            logger.info(f"Successfully embedded {len(text_items)} text embeddings for {file_id}")

        if metadata_items:
            result = await upload_manager.upsert_file_metadata_batch(metadata_items)
            if result is not None:
                logger.info(f"Successfully batch upserted {len(metadata_items)} metadata records for {file_id}")
            else:
                logger.error(f"Failed to batch upsert metadata records for {file_id}")

        if not visual_items and not text_items:
            logger.warning(f"No embeddings to store for {file_id}")

        await upload_manager.update_file_status(
            file_id=file_id,
            processing_status=ProcessingStatus.COMPLETED.value,
            processing_stage=ProcessingStage.COMPLETED.value,
        )
        await publish_event(
            EventType.INDEXING_COMPLETED.value,
            {
                'type': EventType.INDEXING_COMPLETED.value,
                'fileId': file_id,
                'userId': user_id,
                'timestamp': datetime.utcnow().isoformat(),
                'data': {'stage': ProcessingStage.COMPLETED.value},
            }
        )

    except Exception as e:
        logger.error(f"Error processing scenes: {e}", exc_info=True)
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        parent_dir = os.path.join(settings.temp_dir, file_id)
        if os.path.exists(parent_dir):
            shutil.rmtree(parent_dir, ignore_errors=True)


async def _process_scenes_with_retry(event_data: ProcessingCompletedEventModel):
    """Retry wrapper for scene processing — runs as a background task."""
    file_id = event_data.fileId
    user_id = event_data.user.id
    max_retries = settings.max_processing_retries

    # Guard 1: in-process deletion flag (fast, no HTTP)
    if is_deleted(file_id):
        logger.info(f"File {file_id} marked as deleted — skipping scene indexing")
        return

    # Guard 2: DB existence check (handles queued messages after process restart)
    upload_manager_check = UploadManagerService(event_data.user, event_data.session)
    if not await upload_manager_check.get_file_details(file_id):
        logger.info(f"File {file_id} not found in DB (likely deleted) — skipping scene indexing")
        return

    for attempt in range(1, max_retries + 1):
        is_final = attempt == max_retries
        try:
            scene_count = len(event_data.data.scenes) if event_data.data and event_data.data.scenes else 0
            logger.info(
                f"Processing {scene_count} scenes for {file_id} (attempt {attempt}/{max_retries})"
            )
            await _process_scenes_in_background(event_data)
            logger.info(f"✓ Completed scene processing for {file_id}")
            return
        except Exception as e:
            logger.error(
                f"Attempt {attempt}/{max_retries} failed for scenes {file_id}: {e}",
                exc_info=True,
            )
            # File deleted mid-processing — abort without FAILED status
            if is_deleted(file_id):
                logger.info(f"File {file_id} deleted mid-processing — aborting retry loop")
                return
            upload_manager = UploadManagerService(event_data.user, event_data.session)
            if not is_final:
                try:
                    await upload_manager.update_file_status(
                        file_id=file_id,
                        processing_status=ProcessingStatus.IN_PROGRESS.value,
                        processing_retry_count=attempt,
                    )
                    await publish_event(
                        EventType.PROCESSING_RETRYING.value,
                        {
                            'type': EventType.PROCESSING_RETRYING.value,
                            'fileId': file_id,
                            'userId': user_id,
                            'timestamp': datetime.utcnow().isoformat(),
                            'data': {'attempt': attempt, 'maxRetries': max_retries},
                        },
                    )
                except Exception as notify_err:
                    logger.warning(f"Failed to publish retrying event: {notify_err}")

                delay = _RETRY_BACKOFF_SECONDS[min(attempt - 1, len(_RETRY_BACKOFF_SECONDS) - 1)]
                logger.info(f"Retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
            else:
                try:
                    await upload_manager.update_file_status(
                        file_id=file_id,
                        processing_status=ProcessingStatus.FAILED.value,
                        error_message=str(e),
                    )
                    await publish_event(
                        EventType.PROCESSING_FAILED.value,
                        {
                            'type': EventType.PROCESSING_FAILED.value,
                            'fileId': file_id,
                            'userId': user_id,
                            'timestamp': datetime.utcnow().isoformat(),
                            'data': {'error': str(e), 'stage': ProcessingStage.INDEXING.value},
                        },
                    )
                except Exception as final_err:
                    logger.error(f"Failed to update failure state for {file_id}: {final_err}")


@rabbitmq_consumer.register_handler(FileEventType.PROCESSING_COMPLETED)
async def handle_processing_completed(event_data: ProcessingCompletedEventModel):
    """Handle processing completion event — launches background task and returns immediately."""
    background_task_manager.create_task(
        _process_scenes_with_retry(event_data),
        name=f"embed-scenes-{event_data.fileId}",
        file_id=event_data.fileId,
    )

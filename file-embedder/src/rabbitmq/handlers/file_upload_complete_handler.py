import logging
import os
import tempfile
import shutil
import asyncio
from datetime import datetime
from functools import partial
from src.config import settings
from src.utils.file_utils import extract_audio
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.rabbitmq.publisher import publish_event
from src.models.events import UploadCompletedEventModel, EventFileMetadata
from src.models.enums import EventType, FileType, ProcessingStatus, ProcessingStage
from src.services.S3ClientService import S3ClientService
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.UploadManagerService import UploadManagerService
from src.services.YouTubeDownloaderService import YouTubeDownloaderService
from src.decorators.cpu_manager import cpu_executor
from src.utils.background_tasks import background_task_manager
from src.utils.deletion_tracker import is_deleted


logger = logging.getLogger(__name__)

_RETRY_BACKOFF_SECONDS = [5, 15, 45]



def _delete_existing_audio_segments(chroma_db, file_id: str) -> None:
    """Delete existing audio segments for a file before re-inserting (idempotency)."""
    chroma_db.text_collection.delete(
        where={"$and": [{"file_id": file_id}, {"segment_index": {"$gte": 0}}]}
    )
    logger.info(f"Purged existing audio segments for {file_id}")


async def _embed_audio_segments(
    segments: list,
    file_id: str,
    user_id: str,
    original_name: str,
    file_type,
    loop,
    audio_embedder,
) -> list:
    """Embed Whisper transcription segments and return ChromaDB-ready items."""
    items = []
    batch_size = settings.audio_segment_batch_size
    for batch_start in range(0, len(segments), batch_size):
        batch_end = min(batch_start + batch_size, len(segments))
        batch_segments = segments[batch_start:batch_end]
        for i, segment in enumerate(batch_segments, start=batch_start):
            text = segment["text"]
            embedding = await loop.run_in_executor(cpu_executor, audio_embedder.embed_text, text)
            items.append({
                "chunk_id": f"{file_id}#audio#{i}",
                "segment_index": i,
                "file_id": file_id,
                "user_id": user_id,
                "file_type": file_type,
                "file_name": original_name,
                "vector": embedding,
                "start_time": segment["start"],
                "end_time": segment["end"],
                "text": text,
            })
    return items


async def _process_file_in_background(event: UploadCompletedEventModel):
    """Process file with configurable retry logic.

    Retry count controlled by settings.max_processing_retries (default 1 = no retry).
    """
    file_id = event.fileId
    user_id = event.user.id
    max_retries = settings.max_processing_retries
    file_type = event.data.fileType

    if file_type not in (FileType.VIDEO, FileType.YOUTUBE_VIDEO, FileType.AUDIO, FileType.IMAGE):
        logger.warning(f"Unsupported file type {file_type} for file: {file_id}")
        return

    # Guard 1: in-process deletion flag (fast, no HTTP — handles same-process deletions)
    if is_deleted(file_id):
        logger.info(f"File {file_id} marked as deleted — skipping embedding")
        return

    # Guard 2: DB existence check (handles queued messages after process restart)
    upload_manager_check = UploadManagerService(event.user, event.session)
    if not await upload_manager_check.get_file_details(file_id):
        logger.info(f"File {file_id} not found in DB (likely deleted) — skipping embedding")
        return

    for attempt in range(1, max_retries + 1):
        is_final = attempt == max_retries
        try:
            logger.info(
                f"Processing {file_type} file: {file_id} (attempt {attempt}/{max_retries})"
            )
            match file_type:
                case FileType.VIDEO | FileType.YOUTUBE_VIDEO:
                    await process_video(event)
                case FileType.AUDIO:
                    await process_audio(event)
                case FileType.IMAGE:
                    await process_image(event)

            logger.info(f"✓ Completed processing file {file_id}")
            return
        except Exception as e:
            logger.error(
                f"Attempt {attempt}/{max_retries} failed for file {file_id}: {e}",
                exc_info=True,
            )
            # File deleted mid-processing — abort without FAILED status
            if is_deleted(file_id):
                logger.info(f"File {file_id} deleted mid-processing — aborting retry loop")
                return
            upload_manager = UploadManagerService(event.user, event.session)
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
                            'data': {'error': str(e), 'stage': ProcessingStage.EMBEDDING.value},
                        },
                    )
                except Exception as final_err:
                    logger.error(f"Failed to update failure state for {file_id}: {final_err}")


@rabbitmq_consumer.register_handler(FileEventType.UPLOAD_COMPLETED)
async def handle_upload_completed(event: UploadCompletedEventModel):
    """Handle upload completion event — launches background task and returns immediately."""
    background_task_manager.create_task(
        _process_file_in_background(event),
        name=f"embed-upload-{event.fileId}",
        file_id=event.fileId,
    )


async def process_image(event: UploadCompletedEventModel):
    temp_dir = None
    try:
        image_embedder = ImageEmbedderService()
        s3_client = S3ClientService()
        chroma_db = ChromaDatabaseManager()
        upload_manager = UploadManagerService(event.user, event.session)

        file_data: EventFileMetadata = event.data
        file_id = event.fileId
        user_id = event.user.id
        s3_key = file_data.s3Key
        s3_url = file_data.s3Url
        original_name = file_data.fileName
        youtube_url = file_data.youtubeUrl if hasattr(file_data, 'youtubeUrl') else None

        if youtube_url:
            logger.info(f"Skipping image processing for YouTube video: {youtube_url}")
            return

        dir_path = os.path.join(settings.temp_dir, file_id, 'image')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        image_path = os.path.join(temp_dir, original_name)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=image_path)

        loop = asyncio.get_running_loop()
        logger.info(f"Starting image embedding for {file_id}...")
        embedding = await loop.run_in_executor(cpu_executor, image_embedder.embed_image, image_path)
        logger.info(f"Image embedding completed for {file_id}")

        logger.info(f"Starting OCR text extraction for {file_id}...")
        text = await loop.run_in_executor(cpu_executor, image_embedder.extract_text, image_path)
        logger.info(f"OCR completed for {file_id}, extracted {len(text) if text else 0} characters")

        text_embedding = None
        if text:
            logger.info(f"Starting text embedding for {file_id}...")
            text_embedding = await loop.run_in_executor(cpu_executor, image_embedder.embed_text, text)
            logger.info(f"Text embedding completed for {file_id}")

        if settings.nvidia_api_key:
            try:
                description = await asyncio.wait_for(
                    image_embedder.generate_image_description(image_path),
                    timeout=settings.llm_request_timeout * 3 + 30,
                )
                if description:
                    await upload_manager.upsert_file_metadata(
                        file_id=file_id,
                        source_type="IMAGE",
                        description=description,
                    )
                    logger.info(f"Stored metadata for image file: {file_id}")
                else:
                    raise RuntimeError(f"LLM API returned no description for image {file_id}")
            except RuntimeError:
                raise
            except asyncio.TimeoutError:
                raise RuntimeError(f"LLM API timed out for image {file_id}")
            except Exception as e:
                raise RuntimeError(f"LLM API failed for image {file_id}: {e}") from e

        image_items = [
            {
                "chunk_id": f"{file_id}#image#0",
                "file_id": file_id,
                "user_id": user_id,
                "file_type": FileType.IMAGE,
                "file_name": original_name,
                "vector": embedding,
                "text": text,
            }
        ] if embedding is not None else []

        text_items = [
            {
                "chunk_id": f"{file_id}#image#1",
                "file_id": file_id,
                "user_id": user_id,
                "file_type": FileType.IMAGE,
                "file_name": original_name,
                "vector": text_embedding,
                "text": text,
            }
        ] if text and text_embedding is not None else []

        if is_deleted(file_id):
            logger.info(f"File {file_id} deleted during image processing — discarding results")
            return

        if image_items:
            chroma_db.upsert_items(chroma_db.image_index_name, image_items)
            logger.info(f"Successfully embedded image for file: {file_id}")
        else:
            logger.warning(f"No image embedding generated for file: {file_id}")

        if text_items:
            chroma_db.upsert_items(chroma_db.text_index_name, text_items)
            logger.info(f"Successfully embedded text from image for file: {file_id}")
        else:
            logger.warning(f"No text embedding generated for file: {file_id}")

        await upload_manager.update_file_status(
            file_id=file_id,
            processing_status=ProcessingStatus.COMPLETED.value,
            processing_stage=ProcessingStage.COMPLETED.value,
        )

    except Exception as e:
        logger.error(f"Error processing image file {event.fileId}: {e}", exc_info=True)
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        parent_dir = os.path.join(settings.temp_dir, file_id)
        if os.path.exists(parent_dir):
            shutil.rmtree(parent_dir, ignore_errors=True)


async def process_audio(event: UploadCompletedEventModel):
    temp_dir = None
    try:
        s3_client = S3ClientService()
        audio_embedder = AudioEmbedderService(transcription_model=settings.whisper_model)
        chroma_db = ChromaDatabaseManager()

        file_id = event.fileId
        user_id = event.user.id
        dir_path = os.path.join(settings.temp_dir, file_id, 'audio')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        file_data: EventFileMetadata = event.data
        s3_key = file_data.s3Key
        s3_url = file_data.s3Url
        original_name = file_data.fileName
        youtube_url = file_data.youtubeUrl if hasattr(file_data, 'youtubeUrl') else None

        if youtube_url:
            logger.info(f"Skipping audio-only processing for YouTube video: {youtube_url}")
            return

        audio_path = os.path.join(temp_dir, original_name)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=audio_path)

        loop = asyncio.get_running_loop()
        transcription = await loop.run_in_executor(cpu_executor, audio_embedder.transcribe_audio, audio_path)

        segments = transcription["segments"]
        logger.info(f"Generating audio embeddings for {len(segments)} segments...")

        audio_items = await _embed_audio_segments(
            segments, file_id, user_id, original_name, FileType.AUDIO, loop, audio_embedder
        )

        if is_deleted(file_id):
            logger.info(f"File {file_id} deleted during audio processing — discarding results")
            return

        _delete_existing_audio_segments(chroma_db, file_id)
        if audio_items:
            chroma_db.upsert_items(chroma_db.text_index_name, audio_items)
            logger.info(f"Successfully embedded audio for file: {file_id}, {len(audio_items)} segments")
        else:
            logger.warning(f"No audio segments to embed for file: {file_id}")

        upload_manager = UploadManagerService(event.user, event.session)
        await upload_manager.update_file_status(
            file_id=file_id,
            processing_status=ProcessingStatus.COMPLETED.value,
            processing_stage=ProcessingStage.COMPLETED.value,
        )
    except Exception as e:
        logger.error(f"Error processing audio file {event.fileId}: {e}", exc_info=True)
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        parent_dir = os.path.join(settings.temp_dir, file_id)
        if os.path.exists(parent_dir):
            shutil.rmtree(parent_dir, ignore_errors=True)


async def process_video(event: UploadCompletedEventModel):
    temp_dir = None
    try:
        s3_client = S3ClientService()
        audio_embedder = AudioEmbedderService(transcription_model=settings.whisper_model)
        youtube_downloader = YouTubeDownloaderService()
        chroma_db = ChromaDatabaseManager()

        file_id = event.fileId
        user_id = event.user.id
        dir_path = os.path.join(settings.temp_dir, file_id, 'video')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        file_data: EventFileMetadata = event.data
        s3_key = file_data.s3Key
        s3_url = file_data.s3Url
        original_name = file_data.fileName
        youtube_url = file_data.youtubeUrl if hasattr(file_data, 'youtubeUrl') else None

        video_path = os.path.join(temp_dir, file_data.fileName)
        loop = asyncio.get_running_loop()

        if youtube_url:
            logger.info(f"Downloading YouTube video: {youtube_url}")
            try:
                download_result = await youtube_downloader.download_video(
                    youtube_url,
                    video_path,
                )
                logger.info(f"✓ YouTube video downloaded: {download_result['title']}")
            except Exception as e:
                logger.error(f"Failed to download YouTube video: {e}")
                raise
        else:
            await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=video_path)

        raw_file_name = os.path.splitext(original_name)[0].lower()
        audio_path = os.path.join(temp_dir, raw_file_name + '_audio.wav')

        await loop.run_in_executor(cpu_executor, extract_audio, video_path, audio_path)
        transcription = await loop.run_in_executor(cpu_executor, audio_embedder.transcribe_audio, audio_path)

        segments = transcription["segments"]
        total_segments = len(segments)
        logger.info(f"Generating audio embeddings for {total_segments} segments...")

        audio_items = []
        batch_size = settings.audio_segment_batch_size
        for batch_start in range(0, total_segments, batch_size):
            batch_end = min(batch_start + batch_size, total_segments)
            batch_segments = segments[batch_start:batch_end]
            for i, segment in enumerate(batch_segments, start=batch_start):
                text = segment["text"]
                embedding = await loop.run_in_executor(cpu_executor, audio_embedder.embed_text, text)
                audio_items.append({
                    "chunk_id": f"{file_id}#audio#{i}",
                    "segment_index": i,
                    "file_id": file_id,
                    "user_id": user_id,
                    "file_type": FileType.VIDEO,
                    "file_name": original_name,
                    "vector": embedding,
                    "start_time": segment["start"],
                    "end_time": segment["end"],
                    "text": text,
                })

        if is_deleted(file_id):
            logger.info(f"File {file_id} deleted during video processing — discarding results")
            return

        _delete_existing_audio_segments(chroma_db, file_id)
        if audio_items:
            chroma_db.upsert_items(chroma_db.text_index_name, audio_items)
            logger.info(f"Successfully embedded audio for file: {file_id}, {len(audio_items)} segments")
        else:
            logger.warning(f"No audio segments to embed for file: {file_id}")

    except Exception as e:
        logger.error(f"Error processing video file {event.fileId}: {e}", exc_info=True)
        raise
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        parent_dir = os.path.join(settings.temp_dir, file_id)
        if os.path.exists(parent_dir):
            shutil.rmtree(parent_dir, ignore_errors=True)

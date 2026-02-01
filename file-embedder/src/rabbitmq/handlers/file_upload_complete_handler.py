import logging
import os
import tempfile
import shutil
import asyncio
from functools import partial
from src.config import settings
from src.utils.file_utils import extract_audio
from src.utils.background_tasks import background_task_manager
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.models.events import UploadCompletedEventModel, EventFileMetadata
from src.models.enums import FileType, ProcessingStatus, ProcessingStage
from src.services.S3ClientService import S3ClientService
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.UploadManagerService import UploadManagerService
from src.services.YouTubeDownloaderService import YouTubeDownloaderService




logger = logging.getLogger(__name__)


async def _process_file_in_background(event: UploadCompletedEventModel):
    """Background task for processing file without blocking the event handler.
    
    Args:
        event: Validated upload completion event
    """
    try:
        file_data: EventFileMetadata = event.data
        file_type = file_data.fileType
        file_id = event.fileId
        logger.info(f"[Background] Processing {file_type} file: {file_id}")

        match file_type:
            case FileType.VIDEO | FileType.YOUTUBE_VIDEO:
                await process_video(event)
            case FileType.AUDIO:
                await process_audio(event)
            case FileType.IMAGE:
                await process_image(event)
            case _:
                logger.warning(f"Unsupported file type {file_type} for file: {file_id}")
        
        logger.info(f"[Background] ✓ Completed processing file: {file_id}")
    except Exception as e:
        logger.error(f"[Background] Error processing file {event.fileId}: {e}", exc_info=True)


@rabbitmq_consumer.register_handler(FileEventType.UPLOAD_COMPLETED)
async def handle_upload_completed(event: UploadCompletedEventModel):
    """Handle upload completion event and launch background processing.
    
    This handler returns immediately after launching a background task to prevent
    blocking the RabbitMQ consumer and FastAPI event loop during heavy processing.
    
    Args:
        event: Validated upload completion event
    """
    try:
        file_data: EventFileMetadata = event.data
        file_type = file_data.fileType
        file_id = event.fileId
        background_task_manager.create_task(
            _process_file_in_background(event),
            name=f"process_upload_{file_id}"
        )
        logger.info(f"✓ Launched background processing for {file_type} file: {file_id} (active tasks: {background_task_manager.active_count})")
        
    except Exception as e:
        logger.error(f"Error launching background task for file {event.fileId}: {e}", exc_info=True)



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

        # Create directory structure and temp directory
        dir_path = os.path.join(settings.temp_dir, file_id, 'image')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        image_path = os.path.join(temp_dir, original_name)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=image_path)
        
        # Run blocking operations in executor with individual timeouts
        loop = asyncio.get_event_loop()
        
        logger.info(f"Starting image embedding for {file_id}...")
        try:
            embedding = await asyncio.wait_for(
                loop.run_in_executor(None, image_embedder.embed_image, image_path),
                timeout=120.0  # 2 minute timeout for embedding
            )
            logger.info(f"Image embedding completed for {file_id}")
        except asyncio.TimeoutError:
            logger.error(f"Image embedding timeout for {file_id}")
            embedding = None
        
        logger.info(f"Starting OCR text extraction for {file_id}...")
        try:
            text = await asyncio.wait_for(
                loop.run_in_executor(None, image_embedder.extract_text, image_path),
                timeout=180.0  # 3 minute timeout for OCR
            )
            logger.info(f"OCR completed for {file_id}, extracted {len(text) if text else 0} characters")
        except asyncio.TimeoutError:
            logger.error(f"OCR timeout for {file_id}")
            text = None
        
        text_embedding = None
        if text:
            logger.info(f"Starting text embedding for {file_id}...")
            try:
                text_embedding = await asyncio.wait_for(
                    loop.run_in_executor(None, image_embedder.embed_text, text),
                    timeout=60.0
                )
                logger.info(f"Text embedding completed for {file_id}")
            except asyncio.TimeoutError:
                logger.error(f"Text embedding timeout for {file_id}")
                text_embedding = None

        try:
            description = await image_embedder.generate_image_description(image_path)
            if description:
                await upload_manager.upsert_file_metadata(
                    file_id=file_id,
                    source_type="IMAGE",
                    description=description,
                )
                logger.info(f"Stored metadata for image file: {file_id}")
        except Exception as e:
            logger.error(f"Error generating/storing image description for {file_id}: {e}")

        image_items = [
            {
                "chunk_id": f"{file_id}#image#0",
                "file_id": file_id,
                "user_id": user_id,
                "file_type": FileType.IMAGE,
                "file_name": original_name,
                "vector": embedding,
                "text": text
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
                "text": text
            }
        ] if text and text_embedding is not None else []

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
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)



async def process_audio(event: UploadCompletedEventModel):
    temp_dir = None
    try:
        s3_client = S3ClientService()
        audio_embedder = AudioEmbedderService()
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

        # Run blocking transcription in executor
        loop = asyncio.get_event_loop()
        transcription = await loop.run_in_executor(
            None,
            audio_embedder.transcribe_audio,
            audio_path
        )
            
        logger.info("Generating audio embeddings...")
        audio_items = []
        for i, segment in enumerate(transcription["segments"]):
            text = segment["text"]
            # Run embedding in executor
            embedding = await loop.run_in_executor(
                None,
                audio_embedder.embed_text,
                text
            )
            audio_items.append({
                "chunk_id": f"{file_id}#audio#{i}",
                "segment_index": i,
                "file_id": file_id,
                "user_id": user_id,
                "file_type": FileType.AUDIO,
                "file_name": original_name,
                "vector": embedding,
                "start_time": segment["start"],
                "end_time": segment["end"],
                "text": text
            })
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
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)



async def process_video(event: UploadCompletedEventModel):
    temp_dir = None
    try:
        s3_client = S3ClientService()
        audio_embedder = AudioEmbedderService()
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
        
        if youtube_url:
            logger.info(f"Downloading YouTube video: {youtube_url}")
            try:
                download_result = await youtube_downloader.download_video(
                    youtube_url,
                    video_path,
                    quality='worst[ext=mp4]'
                )
                logger.info(f"✓ YouTube video downloaded: {download_result['title']}")
            except Exception as e:
                logger.error(f"Failed to download YouTube video: {e}")
                raise
        else:
            await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=video_path)

        raw_file_name = os.path.splitext(original_name)[0].lower()
        audio_path = os.path.join(temp_dir, raw_file_name + '_audio.wav')

        # Run blocking operations in executor
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            extract_audio,
            video_path,
            audio_path
        )
        transcription = await loop.run_in_executor(
            None,
            audio_embedder.transcribe_audio,
            audio_path
        )
        
        logger.info("Generating audio embeddings...")
        audio_items = []
        for i, segment in enumerate(transcription["segments"]):
            text = segment["text"]
            # Run embedding in executor
            embedding = await loop.run_in_executor(
                None,
                audio_embedder.embed_text,
                text
            )
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
                "text": text
            })
        if audio_items:
            chroma_db.upsert_items(chroma_db.text_index_name, audio_items)
            logger.info(f"Successfully embedded audio for file: {file_id}, {len(audio_items)} segments")
        else:
            logger.warning(f"No audio segments to embed for file: {file_id}")

    except Exception as e:
        logger.error(f"Error processing video file {event.fileId}: {e}", exc_info=True)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
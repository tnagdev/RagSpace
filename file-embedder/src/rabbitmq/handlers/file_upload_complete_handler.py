import logging
import os
import tempfile
import shutil
from src.config import settings
from src.utils.file_utils import extract_audio
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.models.events import UploadCompletedEventModel, EventFileMetadata
from src.models.enums import FileType
from src.services.S3ClientService import S3ClientService
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.UploadManagerService import UploadManagerService




logger = logging.getLogger(__name__)
@rabbitmq_consumer.register_handler(FileEventType.UPLOAD_COMPLETED)
async def handle_upload_completed(event: UploadCompletedEventModel):
    try:
        file_data: EventFileMetadata = event.data
        file_type = file_data.fileType
        logger.info(f"Processing upload completed event for {file_type} file: {event.fileId}")

        match file_type:
            case FileType.VIDEO:
                await process_video(event)
            case FileType.AUDIO:
                await process_audio(event)
            case FileType.IMAGE:
                await process_image(event)
            case _:
                logger.warning(f"Unsupported file type {file_type} for file: {event.fileId}")
    except Exception as e:
        logger.error(f"Error processing upload completed event: {e}", exc_info=True)



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

        # Create directory structure and temp directory
        dir_path = os.path.join(settings.temp_dir, file_id, 'image')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)

        image_path = os.path.join(temp_dir, original_name)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=image_path)
        embedding = image_embedder.embed_image(image_path)
        text = image_embedder.extract_text(image_path)
        text_embedding = image_embedder.embed_text(text) if text else None

        # Generate image description using LLM and store metadata
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

        audio_path = os.path.join(temp_dir, original_name)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=audio_path)

        transcription = audio_embedder.transcribe_audio(audio_path)
            
        logger.info("Generating audio embeddings...")
        audio_items = []
        for i, segment in enumerate(transcription["segments"]):
            text = segment["text"]
            embedding = audio_embedder.embed_text(text)
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

        video_path = os.path.join(temp_dir, file_data.fileName)
        await s3_client.download(s3_url=s3_url, s3_key=s3_key, local_path=video_path)

        raw_file_name = os.path.splitext(original_name)[0].lower()
        audio_path = os.path.join(temp_dir, raw_file_name + '_audio.wav')

        extract_audio(video_path, audio_path)
        transcription = audio_embedder.transcribe_audio(audio_path)
        
        logger.info("Generating audio embeddings...")
        audio_items = []
        for i, segment in enumerate(transcription["segments"]):
            text = segment["text"]
            embedding = audio_embedder.embed_text(text)
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
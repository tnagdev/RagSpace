import logging
import os
import tempfile
import shutil
import asyncio
from src.models.enums import FileType, ProcessingStatus, ProcessingStage
from src.models.events import ProcessingCompletedEventModel
from src.config import settings
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.S3ClientService import S3ClientService
from src.services.UploadManagerService import UploadManagerService
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.decorators.cpu_manager import cpu_executor


logger = logging.getLogger(__name__)


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
            return

        dir_path = os.path.join(settings.temp_dir, file_id, 'scene')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)
        
        visual_items = []
        text_items = []
        metadata_items = []
        
        async def process_scene(i, scene):
            try:
                thumbnail_url = scene.thumbnailUrl
                thumbnail_s3_key = scene.thumbnailS3Key
                scene_id = scene.id

                if not thumbnail_url:
                    logger.warning(f"No thumbnail URL for scene {i}, skipping")
                    return None, None, None

                loop = asyncio.get_running_loop()
                thumbnail_path = os.path.join(temp_dir, f"scene_{i}.jpg")
                await s3_client.download(s3_url=thumbnail_url, s3_key=thumbnail_s3_key, local_path=thumbnail_path)
                
                visual_embedding = await loop.run_in_executor(cpu_executor, video_embedder.embed_image, thumbnail_path)
                await asyncio.sleep(0)
                
                text = await loop.run_in_executor(cpu_executor, video_embedder.extract_text, thumbnail_path)
                
                text_embedding = None
                if text:
                    await asyncio.sleep(0)
                    text_embedding = await loop.run_in_executor(cpu_executor, video_embedder.embed_text, text)
                
                metadata_item = None
                try:
                    description = await video_embedder.generate_image_description(thumbnail_path)
                    if description and scene_id:
                        metadata_item = {
                            "file_id": file_id,
                            "source_type": "SCENE",
                            "description": description,
                            "scene_id": scene_id,
                        }
                except Exception as e:
                    logger.error(f"Error generating scene description for scene {i}: {e}")
                
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
                    "text": text
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
                        "text": text
                    }

                return visual_item, text_item, metadata_item
            except Exception as e:
                logger.error(f"Error processing scene {i} for {file_id}: {e}")
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

        if visual_items:
            chroma_db.upsert_items(chroma_db.image_index_name, visual_items)
            logger.info(f"Successfully embedded {len(visual_items)} visual embeddings for {file_id}")
        
        if text_items:
            chroma_db.upsert_items(chroma_db.text_index_name, text_items)
            logger.info(f"Successfully embedded {len(text_items)} text embeddings for {file_id}")
        
        if metadata_items:
            await upload_manager.upsert_file_metadata_batch(metadata_items)
            logger.info(f"Successfully batch upserted {len(metadata_items)} metadata records for {file_id}")
        
        if not visual_items and not text_items:
            logger.warning(f"No embeddings to store for {file_id}")

        await upload_manager.update_file_status(
            file_id=file_id,
            processing_status=ProcessingStatus.COMPLETED.value,
            processing_stage=ProcessingStage.COMPLETED.value,
        )

    except Exception as e:
        logger.error(f"Error processing scenes: {e}", exc_info=True)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@rabbitmq_consumer.register_handler(FileEventType.PROCESSING_COMPLETED)
async def handle_processing_completed(event_data: ProcessingCompletedEventModel):
    """Handle processing completion event and process scenes."""
    try:
        file_id = event_data.fileId
        scene_count = len(event_data.data.scenes) if event_data.data and event_data.data.scenes else 0
        logger.info(f"Processing {scene_count} scenes for {file_id}")
        
        await _process_scenes_in_background(event_data)
        
        logger.info(f"✓ Completed scene processing for {file_id}")
    except Exception as e:
        logger.error(f"Error processing scenes for {event_data.fileId}: {e}", exc_info=True)
        raise
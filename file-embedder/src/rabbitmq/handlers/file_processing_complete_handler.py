
import logging
import os
import tempfile
import shutil
import asyncio
from typing import Dict, Any
from src.models.enums import FileType
from src.models.events import ProcessingCompletedEventModel
from src.config import settings
from src.utils.background_tasks import background_task_manager
from src.services.VideoEmbedderService import VideoEmbedderService
from src.services.S3ClientService import S3ClientService
from src.services.UploadManagerService import UploadManagerService
from src.db.chroma_db import ChromaDatabaseManager
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType




logger = logging.getLogger(__name__)


async def _process_scenes_in_background(event_data: ProcessingCompletedEventModel):
    """Background task for processing scenes without blocking the event handler.
    
    Args:
        event_data: Validated processing completion event
    """
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
            logger.error("[Background] No file ID in processing completed event")
            return
        
        logger.info(f"[Background] Processing {len(scenes)} scene thumbnails for file: {file_id}")

        if not scenes:
            logger.warning(f"[Background] No scenes found for file: {file_id}")
            return

        dir_path = os.path.join(settings.temp_dir, file_id, 'scene')
        os.makedirs(dir_path, exist_ok=True)
        temp_dir = tempfile.mkdtemp(dir=dir_path)
        
        visual_items = []
        text_items = []
        
        async def process_scene(i, scene):
            try:
                thumbnail_url = scene.thumbnailUrl
                thumbnail_s3_key = scene.thumbnailS3Key
                scene_id = scene.id

                if not thumbnail_url:
                    logger.warning(f"No thumbnail URL for scene {i}, skipping")
                    return None, None

                thumbnail_path = os.path.join(temp_dir, f"scene_{i}.jpg")
                await s3_client.download(s3_url=thumbnail_url, s3_key=thumbnail_s3_key, local_path=thumbnail_path)
                loop = asyncio.get_event_loop()
                
                visual_embedding = await loop.run_in_executor(
                    None,
                    video_embedder.embed_image,
                    thumbnail_path
                )
                
                text = await loop.run_in_executor(
                    None,
                    video_embedder.extract_text,
                    thumbnail_path
                )
                
                text_embedding = None
                if text:
                    text_embedding = await loop.run_in_executor(
                        None,
                        video_embedder.embed_text,
                        text
                    )
                
                try:
                    description = await video_embedder.generate_image_description(thumbnail_path)
                    if description and scene_id:
                        await upload_manager.upsert_file_metadata(
                            file_id=file_id,
                            source_type="SCENE",
                            description=description,
                            scene_id=scene_id,
                        )
                        logger.info(f"Stored metadata for scene {scene_id}")
                except Exception as e:
                    logger.error(f"Error generating/storing scene description for scene {i}: {e}")
                
                # Visual embedding item
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

                # Text embedding item (only if text was extracted)
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

                logger.info(f"Successfully processed scene {i + 1}/{len(scenes)}")
                return visual_item, text_item

            except Exception as e:
                logger.error(f"Error processing scene {i} for {file_id}: {e}")
                return None, None
        
        results = await asyncio.gather(
            *[process_scene(i, scene) for i, scene in enumerate(scenes)],
            return_exceptions=True
        )

        for result in results:
            if result and not isinstance(result, Exception):
                visual_item, text_item = result
                if visual_item:
                    visual_items.append(visual_item)
                if text_item:
                    text_items.append(text_item)

        # Insert visual embeddings into video collection
        if visual_items:
            chroma_db.upsert_items(chroma_db.image_index_name, visual_items)
            logger.info(f"[Background] Successfully embedded {len(visual_items)} visual embeddings for file: {file_id}")
        
        # Insert text embeddings into audio_text collection (for text-based search)
        if text_items:
            chroma_db.upsert_items(chroma_db.text_index_name, text_items)
            logger.info(f"[Background] Successfully embedded {len(text_items)} text embeddings for file: {file_id}")
        
        if not visual_items and not text_items:
            logger.warning(f"[Background] No embeddings to store for file: {file_id}")

        try:
            # Use the upload_manager HTTP client to update the file
            url = f"{upload_manager.upload_manager_url}/upload/{file_id}"
            await upload_manager.client.send_request(
                "PUT",
                url,
                json={
                    "processingStatus": "COMPLETED",
                    "processingStage": "COMPLETED",
                }
            )
            logger.info(f"[Background] Updated file {file_id} status to COMPLETED")
        except Exception as e:
            logger.error(f"[Background] Failed to update file status to COMPLETED: {e}")

    except Exception as e:
        logger.error(f"[Background] Error processing scene detection completed event: {e}", exc_info=True)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@rabbitmq_consumer.register_handler(FileEventType.PROCESSING_COMPLETED)
async def handle_processing_completed(event_data: ProcessingCompletedEventModel):
    """Handle processing completion event and launch background scene processing.
    
    This handler returns immediately after launching a background task to prevent
    blocking the RabbitMQ consumer and FastAPI event loop during heavy processing.
    
    Args:
        event_data: Validated processing completion event
    """
    try:
        file_id = event_data.fileId
        scene_count = len(event_data.data.scenes) if event_data.data and event_data.data.scenes else 0
        background_task_manager.create_task(
            _process_scenes_in_background(event_data),
            name=f"process_scenes_{file_id}"
        )
        logger.info(f"✓ Launched background scene processing for file: {file_id} ({scene_count} scenes, active tasks: {background_task_manager.active_count})")
    except Exception as e:
        logger.error(f"Error launching background task for file {event_data.fileId}: {e}", exc_info=True)
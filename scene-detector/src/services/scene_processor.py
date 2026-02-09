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
    
    async def process_file(self, file_id: str, event_data: UploadCompletedEventModel):
        work_dir = None
        try:
            user = event_data.user
            user_id = user.id if user else None

            file_record = await self.upload_manager_client.get_file(file_id)
            if not file_record:
                raise Exception(f"File not found: {file_id}")
            
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

            file_type = file_record.get('fileType', '').upper()
            filename = os.path.basename(file_record['s3Key'])
            file_path = os.path.join(work_dir, filename)

            # Check if this is a YouTube video
            youtube_url = file_record.get('youtubeUrl')
            if youtube_url:
                logger.info(f"Downloading YouTube video: {youtube_url}")
                try:
                    download_result = await self.youtube_downloader.download_video(
                        youtube_url,
                        file_path,
                        quality='worst[ext=mp4]'
                    )
                    
                    youtube_metadata = file_record.get('metadata', {})
                    youtube_metadata.update({
                        'actualFileSize': download_result['file_size'],
                        'downloadedAt': datetime.utcnow().isoformat(),
                        'downloadedTitle': download_result.get('title'),
                        'downloadedDuration': download_result.get('duration'),
                        'description': download_result.get('description', ''),
                    })
                    
                    video_title = download_result.get('title', file_record.get('filename', 'video'))
                    safe_filename = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in video_title)
                    safe_filename = safe_filename[:100]
                    if download_result.get('duration'):
                        youtube_metadata['duration'] = int(download_result.get('duration', 0))
                    
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
                except Exception as e:
                    logger.error(f"Failed to download YouTube video: {e}")
                    await self.upload_manager_client.update_file_status(
                        file_id,
                        UpdateFileStatusParams(
                            processingStatus=ProcessingStatus.FAILED.value,
                            errorMessage=f"YouTube download failed: {str(e)}"
                        )
                    )
                    raise
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
                
                year = datetime.utcnow().year
                month = datetime.utcnow().month
                thumbnail_s3_key = f"thumbnails/{user_id}/{year}/{month}/files/{file_id}.jpg"

                bucket = file_record.get('s3Bucket', 'user-uploads')
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
                return
            
            scenes_data = await self.scene_detection_service.detect_scenes(file_path)
            
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
            
            logger.info(f"Detected {len(scenes_data)} scenes, processing thumbnails...")
            
            scenes_to_create = []
            year = datetime.utcnow().year
            month = datetime.utcnow().month
            scene_bucket = file_record.get('s3Bucket', 'user-uploads')
            
            async def process_scene(scene_data):
                """Process a single scene asynchronously"""
                try:
                    scene_number = scene_data['scene_number']
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

                    logger.info(f"Processed scene {scene_number}/{len(scenes_data)}")
                    
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
                        f"Error processing scene {scene_data.get('scene_number', 'unknown')}: {e}",
                        exc_info=True
                    )
                    return None
            
            import asyncio
            results = await asyncio.gather(*[process_scene(scene_data) for scene_data in scenes_data])
            scenes_to_create = [scene for scene in results if scene is not None]

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
            
            await self.upload_manager_client.update_file_status(
                file_id,
                UpdateFileStatusParams(
                    processingStatus=ProcessingStatus.IN_PROGRESS.value,
                    processingStage=ProcessingStage.INDEXING.value,
                    metadata={
                        'scenes_detected': len(scenes_to_create),
                        'scenes_total': len(scenes_data)
                    },
                )
            )
            
            await self.rabbitmq_service.publish_event(
                EventType.PROCESSING_COMPLETED.value,
                {
                    'type': EventType.PROCESSING_COMPLETED.value,
                    'fileId': file_id,
                    'fileName': file_record.get('originalFilename') or file_record.get('filename'),
                    'fileType': file_record.get('fileType'),
                    'user': user.model_dump() if hasattr(user, 'model_dump') else user,
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
                f"Scene processing completed for file: {file_id}, "
                f"created {len(scenes_to_create)} scenes"
            )
            
        except Exception as e:
            logger.error(f"Error processing file {file_id}: {e}", exc_info=True)
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



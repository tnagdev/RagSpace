import logging
import os
from typing import List, Dict
from scenedetect import detect, FrameTimecode
from scenedetect.detectors import AdaptiveDetector
from PIL import Image
import cv2

from src.config.settings import settings
from src.decorators import singleton

logger = logging.getLogger(__name__)


@singleton
class SceneDetectionService:
    """Service for detecting scenes in video files"""
    
    def __init__(self):
        self.threshold = settings.scene_detection_threshold
        self.min_scene_length = settings.scene_detection_min_scene_length


    def split_scenes(self, scene, intervals):
        start, end = scene
        frame_rate = start.framerate
        start = start.frame_num
        end = end.frame_num
        scene_length = end - start
        if scene_length <= intervals:
            return [scene]

        num_subscenes = scene_length // intervals
        subscenes = []
        for i in range(num_subscenes):
            sub_start = start + i * intervals
            sub_end = sub_start + intervals
            subscenes.append((FrameTimecode(sub_start, frame_rate), FrameTimecode(sub_end, frame_rate)))

        if scene_length % intervals != 0:
            subscenes.append((FrameTimecode(start + num_subscenes * intervals, frame_rate), FrameTimecode(end, frame_rate)))

        return subscenes
    
    async def detect_scenes(self, video_path: str) -> List[Dict]:
        try:
            scene_list = detect(video_path, detector=AdaptiveDetector(), show_progress=True)
            logger.info(f"Initial scenes detected: {len(scene_list)}")
            results = []
            for scene in scene_list:
                start, end = scene
                if (end.get_seconds() - start.get_seconds()) > 5:
                    results.extend(self.split_scenes(scene, 5))
                else:
                    results.append(scene)
            
            scenes = []
            for idx, (start_time, end_time) in enumerate(results, 1):
                scene_data = {
                    'scene_number': idx,
                    'start_time': start_time.get_seconds(),
                    'end_time': end_time.get_seconds(),
                    'start_frame': start_time.get_frames(),
                    'end_frame': end_time.get_frames(),
                    'keyframe': (start_time.get_frames() + end_time.get_frames()) // 2,
                    'duration': (end_time - start_time).get_seconds()
                }
                scenes.append(scene_data)
            return scenes
        except Exception as e:
            logger.error(f"Error detecting scenes: {e}", exc_info=True)
            raise
    
    async def extract_thumbnail(
        self, 
        video_path: str, 
        frame_number: float,
        output_path: str
    ) -> str:
        try:
            cap = cv2.VideoCapture(video_path)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            
            if not ret:
                raise Exception(f"Failed to read frame at frame number {frame_number}")
            
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(frame_rgb)
            image.thumbnail(
                (settings.thumbnail_width, settings.thumbnail_height),
                Image.Resampling.LANCZOS
            )
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            image.save(
                output_path,
                'JPEG',
                quality=settings.thumbnail_quality,
                optimize=True
            )
            
            return output_path
            
        except Exception as e:
            logger.error(f"Error extracting thumbnail: {e}", exc_info=True)
            raise
            
    async def generate_file_thumbnail(
        self,
        file_path: str,
        file_type: str,
        output_path: str
    ) -> str:
        """Generate thumbnail for image or video file"""
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            if file_type.lower() == 'image':
                # For images, open and resize
                with Image.open(file_path) as img:
                    # Fix rotation based on EXIF orientation
                    try:
                        from PIL import ImageOps
                        img = ImageOps.exif_transpose(img)
                    except Exception:
                        pass  # If EXIF data is not available, continue without rotation fix
                    
                    # Convert RGBA to RGB if needed
                    if img.mode in ('RGBA', 'LA', 'P'):
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        if img.mode == 'P':
                            img = img.convert('RGBA')
                        background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                        img = background
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Create square thumbnail with center crop
                    # Calculate dimensions for center crop to square
                    width, height = img.size
                    size = min(width, height)
                    left = (width - size) // 2
                    top = (height - size) // 2
                    right = left + size
                    bottom = top + size
                    
                    img_cropped = img.crop((left, top, right, bottom))
                    img_resized = img_cropped.resize(
                        (settings.thumbnail_width, settings.thumbnail_height),
                        Image.Resampling.LANCZOS
                    )
                    img_resized.save(
                        output_path,
                        'JPEG',
                        quality=settings.thumbnail_quality,
                        optimize=True
                    )
                    logger.info(f"Generated image thumbnail: {output_path}")
                    
            elif file_type.lower() == 'video':
                # For videos, extract first frame
                cap = cv2.VideoCapture(file_path)
                ret, frame = cap.read()
                cap.release()
                
                if not ret:
                    raise Exception("Failed to read first frame from video")
                
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image = Image.fromarray(frame_rgb)
                
                # Create square thumbnail with center crop
                width, height = image.size
                size = min(width, height)
                left = (width - size) // 2
                top = (height - size) // 2
                right = left + size
                bottom = top + size
                
                img_cropped = image.crop((left, top, right, bottom))
                img_resized = img_cropped.resize(
                    (settings.thumbnail_width, settings.thumbnail_height),
                    Image.Resampling.LANCZOS
                )
                img_resized.save(
                    output_path,
                    'JPEG',
                    quality=settings.thumbnail_quality,
                    optimize=True
                )
                logger.info(f"Generated video thumbnail: {output_path}")
            else:
                raise Exception(f"Unsupported file type for thumbnail: {file_type}")
                
            return output_path
            
        except Exception as e:
            logger.error(f"Error generating thumbnail: {e}", exc_info=True)
            raise
            cap.release()
            return output_path
            
        except Exception as e:
            logger.error(f"Error extracting thumbnail: {e}", exc_info=True)
            raise

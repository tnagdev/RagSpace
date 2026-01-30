import logging
import os
from typing import List, Dict, Optional, Tuple
from contextlib import contextmanager
from scenedetect import detect, FrameTimecode
from scenedetect.detectors import AdaptiveDetector
from PIL import Image, ImageOps
import cv2
from src.config.settings import settings
from src.decorators import singleton

logger = logging.getLogger(__name__)


@singleton
class SceneDetectionService:
    """Service for detecting scenes in video files and generating thumbnails."""
    
    def __init__(self) -> None:
        self.threshold: float = settings.scene_detection_threshold
        self.min_scene_length: int = settings.scene_detection_min_scene_length
        self.thumbnail_size: Tuple[int, int] = (
            settings.thumbnail_width,
            settings.thumbnail_height
        )
        self.thumbnail_quality: int = settings.thumbnail_quality
    
    @contextmanager
    def _video_capture(self, video_path: str):
        """Context manager for safe video capture handling."""
        cap = cv2.VideoCapture(video_path)
        try:
            if not cap.isOpened():
                raise RuntimeError(f"Failed to open video: {video_path}")
            yield cap
        finally:
            cap.release()


    def _split_scene(self, scene: Tuple[FrameTimecode, FrameTimecode], interval_seconds: int) -> List[Tuple[FrameTimecode, FrameTimecode]]:
        """Split a scene into smaller sub-scenes based on time interval.
        
        Args:
            scene: Tuple of (start_time, end_time) FrameTimecode objects
            interval_seconds: Maximum duration for each sub-scene in seconds
            
        Returns:
            List of sub-scene tuples
        """
        start_tc, end_tc = scene
        frame_rate = start_tc.framerate
        start_frame = start_tc.frame_num
        end_frame = end_tc.frame_num
        scene_length = end_frame - start_frame
        
        # Convert interval to frames
        interval_frames = int(interval_seconds * frame_rate)
        
        if scene_length <= interval_frames:
            return [scene]
        
        # Calculate number of complete sub-scenes
        num_subscenes = scene_length // interval_frames
        subscenes = []
        
        for i in range(num_subscenes):
            sub_start = start_frame + (i * interval_frames)
            sub_end = sub_start + interval_frames
            subscenes.append((
                FrameTimecode(sub_start, frame_rate),
                FrameTimecode(sub_end, frame_rate)
            ))
        
        # Handle remaining frames
        if scene_length % interval_frames != 0:
            final_start = start_frame + (num_subscenes * interval_frames)
            subscenes.append((
                FrameTimecode(final_start, frame_rate),
                FrameTimecode(end_frame, frame_rate)
            ))
        
        return subscenes
    
    async def detect_scenes(self, video_path: str, max_scene_duration: int = 5) -> List[Dict]:
        """Detect scenes in a video file and split long scenes.
        
        Args:
            video_path: Path to the video file
            max_scene_duration: Maximum scene duration in seconds
            
        Returns:
            List of scene dictionaries with timing and frame information
        """
        try:
            # Detect scenes using adaptive detector
            scene_list = detect(
                video_path,
                detector=AdaptiveDetector(),
                show_progress=True
            )
            
            logger.info(f"Detected {len(scene_list)} initial scenes")
            
            # Split long scenes into smaller segments
            processed_scenes = []
            for scene in scene_list:
                start_tc, end_tc = scene
                duration = end_tc.get_seconds() - start_tc.get_seconds()
                
                if duration > max_scene_duration:
                    processed_scenes.extend(self._split_scene(scene, max_scene_duration))
                else:
                    processed_scenes.append(scene)
            
            logger.info(f"Processed into {len(processed_scenes)} scenes (after splitting)")
            
            # Convert to dictionaries
            scenes = []
            for idx, (start_time, end_time) in enumerate(processed_scenes, 1):
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
            logger.error(f"Scene detection failed: {e}", exc_info=True)
            raise
    
    async def extract_thumbnail(
        self,
        video_path: str,
        frame_number: int,
        output_path: str
    ) -> str:
        """Extract a specific frame from video and save as thumbnail.
        
        Args:
            video_path: Path to the video file
            frame_number: Frame number to extract
            output_path: Where to save the thumbnail
            
        Returns:
            Path to the saved thumbnail
        """
        try:
            with self._video_capture(video_path) as cap:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                ret, frame = cap.read()
                
                if not ret:
                    raise RuntimeError(f"Failed to read frame {frame_number}")
            
            # Convert and save thumbnail
            self._save_thumbnail_from_frame(frame, output_path)
            logger.debug(f"Extracted thumbnail: frame {frame_number}")
            return output_path
            
        except Exception as e:
            logger.error(f"Thumbnail extraction failed: {e}", exc_info=True)
            raise
    
    def _save_thumbnail_from_frame(self, frame, output_path: str) -> None:
        """Convert CV2 frame to PIL Image and save as thumbnail.
        
        Args:
            frame: OpenCV frame (BGR format)
            output_path: Destination path for thumbnail
        """
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame_rgb)
        
        # Resize maintaining aspect ratio
        image.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save as JPEG
        image.save(
            output_path,
            'JPEG',
            quality=self.thumbnail_quality,
            optimize=True
        )
        
    def _create_square_crop(self, image: Image.Image) -> Image.Image:
        """Create a square center-cropped version of an image.
        
        Args:
            image: PIL Image to crop
            
        Returns:
            Square-cropped PIL Image
        """
        width, height = image.size
        size = min(width, height)
        
        left = (width - size) // 2
        top = (height - size) // 2
        right = left + size
        bottom = top + size
        
        return image.crop((left, top, right, bottom))
    
    async def generate_file_thumbnail(
        self,
        file_path: str,
        file_type: str,
        output_path: str
    ) -> str:
        """Generate thumbnail for image or video file.
        
        Args:
            file_path: Path to source file
            file_type: 'image' or 'video'
            output_path: Destination for thumbnail
            
        Returns:
            Path to generated thumbnail
        """
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            file_type_lower = file_type.lower()
            
            if file_type_lower == 'image':
                self._generate_image_thumbnail(file_path, output_path)
                
            elif file_type_lower in ['video', 'youtube_video']:
                self._generate_video_thumbnail(file_path, output_path)
                
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            logger.info(f"Generated {file_type} thumbnail: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Thumbnail generation failed: {e}", exc_info=True)
            raise
    
    def _generate_image_thumbnail(self, file_path: str, output_path: str) -> None:
        """Generate thumbnail from image file."""
        with Image.open(file_path) as img:
            # Fix orientation from EXIF
            img = ImageOps.exif_transpose(img) or img
            
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                
                if img.mode in ('RGBA', 'LA'):
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                
                img = background
                
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Create square thumbnail
            img_cropped = self._create_square_crop(img)
            img_resized = img_cropped.resize(
                self.thumbnail_size,
                Image.Resampling.LANCZOS
            )
            
            img_resized.save(
                output_path,
                'JPEG',
                quality=self.thumbnail_quality,
                optimize=True
            )
    
    def _generate_video_thumbnail(self, file_path: str, output_path: str) -> None:
        """Generate thumbnail from video file (first frame)."""
        with self._video_capture(file_path) as cap:
            ret, frame = cap.read()
            
            if not ret:
                raise RuntimeError("Failed to read first frame from video")
        
        # Convert to PIL Image
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame_rgb)
        
        # Create square thumbnail
        img_cropped = self._create_square_crop(image)
        img_resized = img_cropped.resize(
            self.thumbnail_size,
            Image.Resampling.LANCZOS
        )
        
        img_resized.save(
            output_path,
            'JPEG',
            quality=self.thumbnail_quality,
            optimize=True
        )

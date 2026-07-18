"""Video embedding utilities using OpenAI CLIP."""
import logging
from PIL import Image

import cv2
import numpy as np
from pydantic import validate_call, ValidationError
from src.decorators.singleton import SingletonMeta
from src.services.AudioEmbedderService import AudioEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService





logger = logging.getLogger(__name__)



class VideoEmbedderService(ImageEmbedderService, AudioEmbedderService, metaclass=SingletonMeta):
    """Handles visual embedding generation using CLIP."""
    
    def __init__(
            self, 
            image_model_name: str = "ViT-B-32", 
            text_model_name: str = "BAAI/bge-base-en-v1.5",
            transcription_model: str = 'base',
        ):
        """
        Initialize VideoEmbedder with CLIP model.
        
        Args:
            model_name: Name of the CLIP model
            device: Device to run model on ('cuda' or 'cpu')
        """
        # Skip if already initialized (prevents duplicate model loading)
        if hasattr(self, '_video_embedder_initialized'):
            return
        self._video_embedder_initialized = True
        
        super().__init__(
            image_model_name=image_model_name,
            text_model_name=text_model_name,
            transcription_model=transcription_model,
        )

    
    def embed_frame(self, frame: np.ndarray) -> np.ndarray:
        """Generate CLIP embedding for a video frame (BGR numpy array from OpenCV)."""
        try:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            return self.embed_image(pil_image)
        except ValidationError as e:
            logger.error(f"Validation error during frame embedding: {e}")
            return None
        except Exception as e:
            logger.error(f"Error embedding frame: {e}")
            return None
    
    def extract_middle_frame(self, video_path: str, start_frame: int, end_frame: int) -> np.ndarray:
        """
        Extract the middle frame from a video segment.
        
        Args:
            video_path: Path to video file
            start_frame: Start frame number
            end_frame: End frame number
            
        Returns:
            Frame as numpy array
        """
        try:
            cap = cv2.VideoCapture(video_path)
            middle_frame_num = (start_frame + end_frame) // 2
            cap.set(cv2.CAP_PROP_POS_FRAMES, middle_frame_num)
            ret, frame = cap.read()
            cap.release()
            
            if not ret:
                raise ValueError(f"Failed to extract frame {middle_frame_num} from {video_path}")
        except ValidationError as e:
            logger.error(f"Validation error during middle frame extraction: {e}")
            return None
        except Exception as e:
            logger.error(f"Error extracting middle frame: {e}")
            return None 
        return frame
    
    @validate_call
    def process_scenes(self, video_path: str, scenes: list) -> list:
        """
        Process video scenes to generate embeddings for middle frames.
        
        Args:
            video_path: Path to video file
            scenes: List of scene dictionaries with start_frame and end_frame
            
        Returns:
            List of scene embeddings
        """
        try:
            scene_embeddings = []
            
            for i, scene in enumerate(scenes):
                try:
                    # Extract middle frame
                    frame = self.extract_middle_frame(
                        video_path,
                        scene["start_frame"],
                        scene["end_frame"]
                    )
                    
                    # Generate embedding
                    embedding = self.embed_frame(frame)
                    
                    scene_embeddings.append({
                        "scene_index": i,
                        "start_frame": scene["start_frame"],
                        "end_frame": scene["end_frame"],
                        "start_time": scene.get("start_time"),
                        "end_time": scene.get("end_time"),
                        "vector": embedding.tolist()
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing scene {i}: {e}")
            
            logger.info(f"Processed {len(scene_embeddings)} scene embeddings")
            return scene_embeddings
        except ValidationError as e:
            logger.error(f"Validation error during scene processing: {e}")
            return None
        except Exception as e:
            logger.error(f"Error processing scenes: {e}")
            return None
        
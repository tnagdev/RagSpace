"""Video embedding utilities using OpenAI CLIP."""
from pydantic import validate_call, ValidationError
from typing import Union
import torch
import open_clip
import numpy as np
from PIL import Image
import cv2
import logging
import pytesseract
from torch import Tensor, cuda
from src.decorators.singleton import SingletonMeta
from src.services.TextEmbedderService import TextEmbedderService
from src.services.LLMService import LLMService, ImageDescription

logger = logging.getLogger(__name__)


class ImageEmbedderService(TextEmbedderService, metaclass=SingletonMeta):
    
    def __init__(self, image_model_name: str = "ViT-B-32", text_model_name: str = "BAAI/bge-base-en-v1.5", **kwargs):
        """
        Initialize ImageEmbedder with CLIP model.
        
        Args:
            image_model_name: Name of the CLIP model
            device: Device to run model on ('cuda' or 'cpu')
        """
        # Skip if already initialized (prevents duplicate model loading)
        if hasattr(self, '_image_embedder_initialized'):
            return
        
        self._image_embedder_initialized = True    
        self.device = "cuda" if cuda.is_available() else "cpu"
        logger.info(f"Loading CLIP model: {image_model_name} on {self.device}")

        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            image_model_name, 
            pretrained='openai'
        )
        self.tokenizer = open_clip.get_tokenizer(image_model_name)
        self.model.eval().to(self.device)
        super().__init__(text_model_name=text_model_name, **kwargs)
    
    async def generate_image_description(self, image_path: str) -> ImageDescription | None:
        """
        Generate a text description for an image using LLM.
        
        Args:
            image_path: Path to the image file
        Returns:
            ImageDescription with:
            - summary: Descriptive summary of the image content
            - objects: ["person","neon sign","car"] - tags based on the image objects
            - setting: "city street at night" - context of the image
            - style: "cyberpunk lighting" - artistic style if applicable
            - colors: ["purple","teal","black"] - dominant colors in the image
        """
        llm_service = LLMService()
        return await llm_service.generate_image_description(image_path)
    
    def embed_image(self, image: Union[str, Image.Image]) -> np.ndarray | None:
        """Generate CLIP embedding for an image file path or a PIL Image."""
        try:
            if isinstance(image, str):
                with Image.open(image) as raw:
                    image = raw.convert('RGB')
            elif not isinstance(image, Image.Image):
                raise TypeError(f"Expected str or PIL.Image, got {type(image)}")
            image_tensor = self.preprocess(image).unsqueeze(0).to(self.device)  # type: ignore

            with torch.no_grad():
                image_features = self.model.encode_image(image_tensor)  # type: ignore
                image_features = image_features.cpu().numpy()[0]

            return image_features / np.linalg.norm(image_features)
        except ValidationError as e:
            logger.error(f"Validation error during image embedding: {e}")
            return None
        except Exception as e:
            logger.error(f"Error embedding image: {e}")
            return None

    @validate_call
    def embed_text_with_clip(self, text: str) -> np.ndarray | None:
        """
        Generate text embedding using CLIP's text encoder (512-dim).
        This is compatible with image embeddings from CLIP.
        """
        try:
            with torch.no_grad():
                text_tokens = self.tokenizer([text]).to(self.device)
                text_features = self.model.encode_text(text_tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
                embedding = text_features.cpu().numpy()[0]
            return embedding
        except ValidationError as e:
            logger.error(f"Validation error during text embedding with CLIP: {e}")
            return None
        except Exception as e:
            logger.error(f"Error embedding text with CLIP: {e}")
            return None
    

    @validate_call
    def extract_text(self, image_path: str) -> str:
        """
        Extract text from an image using OCR (Tesseract).
        
        Args:
            image_path: Path to image file
        Returns:
            Extracted text as a string
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.error(f"Failed to read image from {image_path}")
                return ""
            
            # Resize large images to speed up OCR (max 2000px on longest side)
            height, width = image.shape[:2]
            max_dimension = max(height, width)
            if max_dimension > 2000:
                scale = 2000 / max_dimension
                new_width = int(width * scale)
                new_height = int(height * scale)
                image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
                logger.info(f"Resized image from {width}x{height} to {new_width}x{new_height} for OCR")
            
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            text = pytesseract.image_to_string(gray)
            return text.strip()
        except ValidationError as e:
            logger.error(f"Validation error during text extraction: {e}")
            return ""
        except Exception as e:
            logger.error(f"Error extracting text from image {image_path}: {e}")
            return ""
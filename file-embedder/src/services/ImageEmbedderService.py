"""Video embedding utilities using OpenAI CLIP."""
from pydantic import validate_call, ValidationError
import torch
import open_clip
import numpy as np
from PIL import Image
import cv2
import logging
import pytesseract
from torch import Tensor, cuda
from src.decorators import singleton
from src.services.TextEmbedderService import TextEmbedderService

logger = logging.getLogger(__name__)

@singleton
class ImageEmbedderService(TextEmbedderService):
    
    def __init__(self, image_model_name: str = "ViT-B-32", text_model_name: str = "BAAI/bge-base-en-v1.5", **kwargs):
        """
        Initialize ImageEmbedder with CLIP model.
        
        Args:
            image_model_name: Name of the CLIP model
            device: Device to run model on ('cuda' or 'cpu')
        """
        self.device = "cuda" if cuda.is_available() else "cpu"
        logger.info(f"Loading CLIP model: {image_model_name} on {self.device}")

        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            image_model_name, 
            pretrained='openai'
        )
        self.tokenizer = open_clip.get_tokenizer(image_model_name)
        self.model.eval().to(self.device)
        super().__init__(text_model_name=text_model_name, **kwargs)
    
    def embed_image(self, image_path: str) -> np.ndarray:
        """
        Generate embedding for an image using CLIP.
        """
        try:
            image = Image.open(image_path).convert('RGB')
            image_tensor = self.preprocess(image).unsqueeze(0).to(self.device) # type: ignore

            with torch.no_grad():
                image_features = self.model.encode_image(image_tensor) # type: ignore
                image_features = image_features.cpu().numpy()[0]
                
            image_features = image_features / np.linalg.norm(image_features)
            return image_features
        except ValidationError as e:
            logger.error(f"Validation error during image embedding: {e}")
            return None
        except Exception as e:
            logger.error(f"Error embedding image {image_path}: {e}")
            return None

    @validate_call
    def embed_text_with_clip(self, text: str) -> Tensor:
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
            
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            text = pytesseract.image_to_string(gray)
            return text.strip()
        except ValidationError as e:
            logger.error(f"Validation error during text extraction: {e}")
            return None
        except Exception as e:
            logger.error(f"Error extracting text from image {image_path}: {e}")
            return None
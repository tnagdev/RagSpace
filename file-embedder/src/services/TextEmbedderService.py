
from pydantic import ValidationError, validate_call
from typing import Optional
from sentence_transformers import SentenceTransformer
from torch import Tensor
import logging
from src.decorators.singleton import singleton


logger = logging.getLogger(__name__)


@singleton
class TextEmbedderService:
    
    def __init__(self, text_model_name: str = "BAAI/bge-base-en-v1.5"):
        """
        Initialize TextEmbedder with SentenceTransformer model.
        
        Args:
            text_model_name: Name of the SentenceTransformer model
        """
        self.text_model = SentenceTransformer(text_model_name)

    @validate_call
    def embed_text(self, text: str) -> Tensor:
        try:
            embedding = self.text_model.encode(text, normalize_embeddings=True)
            return embedding
        except ValidationError as e:
            logger.error(f"Validation error during text embedding: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during text embedding: {e}")
            return None
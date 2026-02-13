
from pydantic import ValidationError, validate_call
from typing import Optional, List
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModel
from torch import Tensor
import torch
import numpy as np
import logging
from src.decorators.singleton import SingletonMeta


logger = logging.getLogger(__name__)


class TextEmbedderService(metaclass=SingletonMeta):
    
    def __init__(self, text_model_name: str = "BAAI/bge-base-en-v1.5", use_contriever: bool = True):
        """
        Initialize TextEmbedder with dual model support:
        - SentenceTransformer for general embeddings
        - Contriever for retrieval-optimized embeddings
        
        Args:
            text_model_name: Name of the SentenceTransformer model
            use_contriever: Whether to load Contriever model for retrieval
        """
        # Skip if already initialized (prevents duplicate model loading)
        if hasattr(self, '_text_embedder_initialized'):
            return
        
        self._text_embedder_initialized = True    
        logger.info(f"Loading text embedding model: {text_model_name}")
        self.text_model = SentenceTransformer(text_model_name)
        
        # Load Contriever for better retrieval performance
        self.contriever_model = None
        self.contriever_tokenizer = None
        if use_contriever:
            try:
                logger.info("Loading Contriever model for retrieval optimization")
                self.contriever_tokenizer = AutoTokenizer.from_pretrained('facebook/contriever')
                self.contriever_model = AutoModel.from_pretrained('facebook/contriever')
                self.contriever_model.eval()
                logger.info("Contriever model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load Contriever model: {e}. Falling back to base model.")

    @validate_call
    def embed_text(self, text: str, use_contriever: bool = False) -> np.ndarray:
        """
        Generate text embedding using specified model.
        
        Args:
            text: Input text to embed
            use_contriever: Use Contriever model for retrieval-optimized embeddings
        
        Returns:
            Normalized embedding vector
        """
        try:
            if use_contriever and self.contriever_model is not None:
                return self._embed_with_contriever(text)
            else:
                embedding = self.text_model.encode(text, normalize_embeddings=True)
                return embedding
        except ValidationError as e:
            logger.error(f"Validation error during text embedding: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during text embedding: {e}")
            return None
    
    def _embed_with_contriever(self, text: str, max_length: int = 512) -> np.ndarray:
        """
        Generate retrieval-optimized embedding using Contriever.
        Based on Video-RAG's text_to_vector implementation.
        
        Args:
            text: Input text
            max_length: Maximum token length
        
        Returns:
            Mean-pooled normalized embedding
        """
        inputs = self.contriever_tokenizer(
            text, 
            return_tensors='pt', 
            truncation=True, 
            padding=True, 
            max_length=max_length
        )
        with torch.no_grad():
            outputs = self.contriever_model(**inputs)
        # Mean pooling over token embeddings
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy()
        # Normalize
        embedding = embedding / np.linalg.norm(embedding)
        return embedding
    
    def embed_texts_batch(self, texts: List[str], use_contriever: bool = False) -> np.ndarray:
        """
        Batch embed multiple texts for efficiency.
        
        Args:
            texts: List of texts to embed
            use_contriever: Use Contriever model
        
        Returns:
            Array of normalized embeddings
        """
        try:
            if use_contriever and self.contriever_model is not None:
                embeddings = [self._embed_with_contriever(text) for text in texts]
                return np.array(embeddings)
            else:
                embeddings = self.text_model.encode(texts, normalize_embeddings=True)
                return embeddings
        except Exception as e:
            logger.error(f"Error during batch text embedding: {e}")
            return None
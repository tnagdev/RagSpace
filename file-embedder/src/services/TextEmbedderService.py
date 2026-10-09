import logging

import numpy as np
from sentence_transformers import SentenceTransformer

from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class TextEmbedderService(metaclass=SingletonMeta):
    def __init__(self, text_model_name: str = "BAAI/bge-base-en-v1.5"):
        try:
            self.text_model = SentenceTransformer(text_model_name, local_files_only=True)
        except Exception:
            logger.info("Model %s not cached; downloading", text_model_name)
            self.text_model = SentenceTransformer(text_model_name)

    def embed_text(self, text: str) -> np.ndarray | None:
        try:
            return self.text_model.encode(text, normalize_embeddings=True)
        except Exception as error:
            logger.error("Text embedding failed: %s", error)
            return None

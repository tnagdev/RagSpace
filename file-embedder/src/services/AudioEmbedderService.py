"""Audio embedding utilities using Sentence Transformers and Whisper."""
from torch import Tensor, cuda
import whisper
import logging
from pydantic import validate_call, ValidationError
from src.decorators.singleton import SingletonMeta
from src.services.TextEmbedderService import TextEmbedderService

logger = logging.getLogger(__name__)


class AudioEmbedderService(TextEmbedderService, metaclass=SingletonMeta):
    def __init__(self, transcription_model = 'base', text_model_name: str = "BAAI/bge-base-en-v1.5", **kwargs):
        """
        Initialize AudioEmbedder with Whisper and SentenceTransformer models.
        
        Args:
            text_model_name: Name of the SentenceTransformer model
            device: Device to run models on ('cuda' or 'cpu')
        """
        # Skip if already initialized (prevents duplicate model loading)
        if hasattr(self, '_audio_embedder_initialized'):
            return
        
        self._audio_embedder_initialized = True    
        self.device = "cuda" if cuda.is_available() else "cpu"
        logger.info(f"Loading Whisper model '{transcription_model}' on {self.device}...")

        self.transcription_model = whisper.load_model(transcription_model, device=self.device)
        logger.info("Whisper model loaded successfully")
        super().__init__(text_model_name=text_model_name, **kwargs)
    
    @validate_call
    def transcribe_audio(self, audio_path: str) -> dict[str, str | list]:
        """
        Transcribe audio file using Whisper.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Dictionary containing transcription segments with timestamps
        """
        try:
            logger.info(f"Transcribing audio: {audio_path}")
            result = self.transcription_model.transcribe(audio_path)
            return result
        except AttributeError as e:
            logger.error(f"Transcription model not initialized: {e}")
            return None
        except ValidationError as e:
            logger.error(f"Validation error during transcription: {e}")
            return None
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return None
    
    @validate_call
    def process_audio(self, audio_path: str) -> tuple:
        try:
            result = self.transcribe_audio(audio_path)
            segments = result.get("segments", [])
            full_text = result.get("text", "")
            segment_embeddings = []
            for segment in segments:
                text = segment["text"].strip()
                if text:
                    embedding = self.embed_text(text)
                    segment_embeddings.append({
                        "text": text,
                        "start": segment["start"],
                        "end": segment["end"],
                        "vector": embedding.tolist()
                    })
            
            logger.info(f"Processed {len(segment_embeddings)} audio segments")
            return full_text, segment_embeddings
        except ValidationError as e:
            logger.error(f"Validation error processing audio {audio_path}: {e}")
            return None, None
        except Exception as e:
            logger.error(f"Error processing audio {audio_path}: {e}")
            return None, None

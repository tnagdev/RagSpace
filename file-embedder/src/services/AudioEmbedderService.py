"""Audio embedding utilities using Sentence Transformers and faster-whisper."""
import json

from torch import cuda
from faster_whisper import WhisperModel
import logging
from pydantic import validate_call, ValidationError
from src.decorators.singleton import SingletonMeta
from src.services.TextEmbedderService import TextEmbedderService

logger = logging.getLogger(__name__)

# Merge single-word fragments into the previous segment; drop tiny noise artifacts.
_MIN_SEGMENT_WORDS = 2
_MIN_SEGMENT_CHARS = 5


def _merge_short_segments(segments: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for seg in segments:
        text = seg["text"].strip()
        if not text:
            continue
        if len(text.split()) < _MIN_SEGMENT_WORDS and merged:
            # Too short — extend the previous segment's span and text
            merged[-1]["text"] = merged[-1]["text"].rstrip() + " " + text
            merged[-1]["end"] = seg["end"]
        else:
            merged.append({"text": text, "start": seg["start"], "end": seg["end"]})
    # Drop any isolated fragments still below the character floor
    return [s for s in merged if len(s["text"].strip()) >= _MIN_SEGMENT_CHARS]


class AudioEmbedderService(TextEmbedderService, metaclass=SingletonMeta):
    def __init__(self, transcription_model: str = 'base', text_model_name: str = "BAAI/bge-base-en-v1.5", **kwargs):
        """Initialize AudioEmbedder with faster-whisper and SentenceTransformer models."""
        # Skip if already initialized (prevents duplicate model loading)
        if hasattr(self, '_audio_embedder_initialized'):
            return

        self._audio_embedder_initialized = True
        self.device = "cuda" if cuda.is_available() else "cpu"
        # int8 is fastest on CPU; float16 gives best GPU throughput
        compute_type = "float16" if self.device == "cuda" else "int8"
        logger.info(
            f"Loading faster-whisper model '{transcription_model}' "
            f"on {self.device} (compute_type={compute_type})..."
        )
        self.transcription_model = WhisperModel(
            transcription_model, device=self.device, compute_type=compute_type
        )
        logger.info("faster-whisper model loaded successfully")
        super().__init__(text_model_name=text_model_name, **kwargs)

    @validate_call
    def transcribe_audio(self, audio_path: str) -> dict[str, str | list]:
        """Transcribe audio file using faster-whisper.

        Returns:
            Dict with 'text' (str) and 'segments' (list of {text, start, end}).
        """
        try:
            logger.info(f"Transcribing audio: {audio_path}")
            segments_gen, _info = self.transcription_model.transcribe(
                audio_path,
                beam_size=5,
                vad_filter=True,
                # Raise min silence to 500ms so VAD doesn't chop at word boundaries
                vad_parameters={"min_silence_duration_ms": 500},
                # Prevents the model from conditioning on previous segment text,
                # which is the main cause of hallucinated garbage fragments
                condition_on_previous_text=False,
                # Greedy decoding — reduces random hallucination vs sampling
                temperature=0.0,
            )
            raw_segments = [
                {"text": seg.text.strip(), "start": seg.start, "end": seg.end}
                for seg in segments_gen
                if seg.text.strip()
            ]
            segments = _merge_short_segments(raw_segments)
            logger.info(f"Transcription completed: {json.dumps([s['text'] for s in segments])}")
            return {
                "text": " ".join(s["text"] for s in segments),
                "segments": segments,
            }
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

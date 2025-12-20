"""
Audio transcription service using OpenAI Whisper.
Implements Video-RAG's ASR (Automatic Speech Recognition) approach.
"""
import torch
import torchaudio
import logging
import os
from typing import List, Optional, Dict, Any
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import ffmpeg
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)


@singleton
class AudioTranscriptionService:
    """
    Service for extracting audio transcripts from video/audio files.
    Based on Video-RAG's Whisper implementation.
    """
    
    def __init__(
        self,
        model_name: str = "openai/whisper-base",
        chunk_length_s: int = 30,
        device: Optional[str] = None
    ):
        """
        Initialize Whisper model for audio transcription.
        
        Args:
            model_name: Whisper model variant (tiny, base, small, medium, large)
            chunk_length_s: Length of audio chunks in seconds
            device: Device to run on ('cuda' or 'cpu')
        """
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        logger.info(f"Loading Whisper model: {model_name} on {self.device}")
        
        try:
            self.processor = WhisperProcessor.from_pretrained(model_name)
            self.model = WhisperForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
            )
            self.model.to(self.device)
            self.model.eval()
            self.chunk_length_s = chunk_length_s
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise
    
    def extract_audio_from_video(self, video_path: str, audio_path: str) -> bool:
        """
        Extract audio track from video file using ffmpeg.
        Based on Video-RAG's extract_audio function.
        
        Args:
            video_path: Path to video file
            audio_path: Output path for audio file
        
        Returns:
            True if successful, False otherwise
        """
        try:
            if os.path.exists(audio_path):
                logger.info(f"Audio file already exists: {audio_path}")
                return True
            
            # Extract audio: PCM 16-bit, mono, 16kHz (Whisper's expected format)
            ffmpeg.input(video_path).output(
                audio_path,
                acodec='pcm_s16le',  # PCM 16-bit
                ac=1,                 # Mono
                ar='16k'              # 16kHz sample rate
            ).run(quiet=True)
            
            logger.info(f"Audio extracted successfully to {audio_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to extract audio from {video_path}: {e}")
            return False
    
    def chunk_audio(self, audio_path: str) -> List[torch.Tensor]:
        """
        Split audio into chunks for efficient processing.
        Implements Video-RAG's chunk_audio approach.
        
        Args:
            audio_path: Path to audio file
        
        Returns:
            List of audio chunk tensors
        """
        try:
            speech, sr = torchaudio.load(audio_path)
            
            # Convert stereo to mono if needed
            if speech.shape[0] > 1:
                speech = speech.mean(dim=0)
            else:
                speech = speech.squeeze(0)
            
            # Resample to 16kHz if needed
            if sr != 16000:
                resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=16000)
                speech = resampler(speech)
            
            # Split into chunks
            num_samples_per_chunk = self.chunk_length_s * 16000
            chunks = []
            for i in range(0, len(speech), num_samples_per_chunk):
                chunk = speech[i:i + num_samples_per_chunk]
                if len(chunk) > 0:  # Skip empty chunks
                    chunks.append(chunk)
            
            logger.info(f"Audio split into {len(chunks)} chunks of {self.chunk_length_s}s")
            return chunks
        except Exception as e:
            logger.error(f"Failed to chunk audio: {e}")
            return []
    
    def transcribe_chunk(self, chunk: torch.Tensor) -> str:
        """
        Transcribe a single audio chunk using Whisper.
        Based on Video-RAG's transcribe_chunk function.
        
        Args:
            chunk: Audio chunk tensor
        
        Returns:
            Transcribed text
        """
        try:
            inputs = self.processor(chunk.numpy(), return_tensors="pt", sampling_rate=16000)
            inputs["input_features"] = inputs["input_features"].to(
                self.device,
                torch.float16 if self.device == "cuda" else torch.float32
            )
            
            with torch.no_grad():
                predicted_ids = self.model.generate(
                    inputs["input_features"],
                    no_repeat_ngram_size=2,  # Avoid repetition
                    early_stopping=True
                )
            
            transcription = self.processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True
            )[0]
            
            return transcription.strip()
        except Exception as e:
            logger.error(f"Failed to transcribe chunk: {e}")
            return ""
    
    def transcribe_audio_file(
        self,
        audio_path: str,
        cache_path: Optional[str] = None
    ) -> List[str]:
        """
        Transcribe entire audio file, returning list of chunk transcriptions.
        
        Args:
            audio_path: Path to audio file
            cache_path: Optional path to cache transcription results
        
        Returns:
            List of transcribed text segments (one per chunk)
        """
        # Check cache first
        if cache_path and os.path.exists(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    transcriptions = [line.strip() for line in f.readlines()]
                logger.info(f"Loaded cached transcription from {cache_path}")
                return transcriptions
            except Exception as e:
                logger.warning(f"Failed to load cache: {e}")
        
        # Transcribe audio
        chunks = self.chunk_audio(audio_path)
        transcriptions = []
        
        for i, chunk in enumerate(chunks):
            logger.info(f"Transcribing chunk {i+1}/{len(chunks)}")
            transcription = self.transcribe_chunk(chunk)
            if transcription:
                transcriptions.append(transcription)
        
        # Cache results if path provided
        if cache_path and transcriptions:
            try:
                os.makedirs(os.path.dirname(cache_path), exist_ok=True)
                with open(cache_path, 'w', encoding='utf-8') as f:
                    for trans in transcriptions:
                        f.write(trans + '\n')
                logger.info(f"Cached transcription to {cache_path}")
            except Exception as e:
                logger.warning(f"Failed to cache transcription: {e}")
        
        return transcriptions
    
    def transcribe_video(
        self,
        video_path: str,
        audio_output_dir: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Complete workflow: Extract audio from video and transcribe.
        
        Args:
            video_path: Path to video file
            audio_output_dir: Directory to store extracted audio and transcripts
        
        Returns:
            Dictionary with transcriptions and metadata
        """
        try:
            # Set up paths
            video_name = os.path.splitext(os.path.basename(video_path))[0]
            
            if audio_output_dir is None:
                audio_output_dir = "./audio_cache"
            os.makedirs(audio_output_dir, exist_ok=True)
            
            audio_path = os.path.join(audio_output_dir, f"{video_name}.wav")
            cache_path = os.path.join(audio_output_dir, f"{video_name}.txt")
            
            # Extract audio
            if not self.extract_audio_from_video(video_path, audio_path):
                return {
                    'success': False,
                    'error': 'Failed to extract audio',
                    'transcriptions': []
                }
            
            # Transcribe
            transcriptions = self.transcribe_audio_file(audio_path, cache_path)
            
            return {
                'success': True,
                'video_path': video_path,
                'audio_path': audio_path,
                'transcriptions': transcriptions,
                'num_segments': len(transcriptions),
                'full_text': ' '.join(transcriptions)
            }
        except Exception as e:
            logger.error(f"Failed to transcribe video {video_path}: {e}")
            return {
                'success': False,
                'error': str(e),
                'transcriptions': []
            }
    
    def get_timestamped_transcriptions(
        self,
        transcriptions: List[str],
        chunk_length_s: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Add timestamp information to transcriptions.
        
        Args:
            transcriptions: List of transcribed segments
            chunk_length_s: Length of each chunk in seconds
        
        Returns:
            List of dicts with text, start_time, end_time
        """
        if chunk_length_s is None:
            chunk_length_s = self.chunk_length_s
        
        timestamped = []
        for i, text in enumerate(transcriptions):
            start_time = i * chunk_length_s
            end_time = (i + 1) * chunk_length_s
            timestamped.append({
                'text': text,
                'start_time': start_time,
                'end_time': end_time,
                'segment_index': i
            })
        
        return timestamped

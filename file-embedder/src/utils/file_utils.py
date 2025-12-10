"""File processing utilities."""
import os
import tempfile
import ffmpeg
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_audio(video_path: str, output_path: Optional[str] = None) -> str:
    """
    Extract audio from video file.
    
    Args:
        video_path: Path to video file
        output_path: Optional output path for audio file
        
    Returns:
        Path to extracted audio file
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix='.mp3')
        os.close(fd)
    
    logger.info(f"Extracting audio from {video_path} to {output_path}")
    
    try:
        stream = ffmpeg.input(video_path) # type: ignore
        stream = ffmpeg.output(stream, output_path, acodec='libmp3lame', ac=1, ar='16000')  # type: ignore
        ffmpeg.run(stream, overwrite_output=True, capture_stdout=True, capture_stderr=True)  # type: ignore
        logger.info(f"Audio extracted successfully to {output_path}")
        return output_path
    except ffmpeg.Error as e:  # type: ignore
        logger.error(f"Error extracting audio: {e.stderr.decode() if e.stderr else str(e)}")
        raise


def get_video_info(video_path: str) -> dict:
    """
    Get video file information.
    
    Args:
        video_path: Path to video file
        
    Returns:
        Dictionary with video metadata
    """
    try:
        probe = ffmpeg.probe(video_path)  # type: ignore
        video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        
        return {
            'duration': float(probe['format']['duration']),
            'width': int(video_info['width']),
            'height': int(video_info['height']),
            'fps': eval(video_info['r_frame_rate']),
            'codec': video_info['codec_name']
        }
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        raise

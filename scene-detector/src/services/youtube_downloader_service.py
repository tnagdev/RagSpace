import logging
import os
from typing import Optional
import yt_dlp
from src.config.settings import settings

logger = logging.getLogger(__name__)


class YouTubeDownloaderService:
    """Service for downloading YouTube videos using yt-dlp"""
    
    def __init__(self):
        """Initialize the YouTube downloader service"""
        pass
    
    async def download_video(
        self, 
        url: str, 
        output_path: str,
        quality: str = 'worst[ext=mp4]'
    ) -> dict:
        """
        Download YouTube video in minimal required quality
        
        Args:
            url: YouTube video URL
            output_path: Local path to save the video
            quality: Quality format selector (default: lowest quality mp4)
                    Options: 'worst[ext=mp4]', 'worstvideo[ext=mp4]+worstaudio', 
                             'best[height<=480]', etc.
        
        Returns:
            dict: Information about the downloaded video (filepath, title, duration, etc.)
        """
        try:
            logger.info(f"Starting YouTube download: {url}")
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # yt-dlp options for minimal quality download
            ydl_opts = {
                'format': quality,  # Download lowest quality to save bandwidth
                'outtmpl': output_path,
                'quiet': False,
                'no_warnings': False,
                'extract_flat': False,
                'nocheckcertificate': True,
                'ignoreerrors': False,
                'no_color': True,
                # Add merge output format if separate video/audio
                'merge_output_format': 'mp4',
                # Use alternative player clients to bypass bot detection
                'extractor_args': {
                    'youtube': {
                        'player_client': settings.youtube_player_client.split(','),
                    }
                },
                # Limit download speed (optional)
                # 'ratelimit': 1000000,  # 1 MB/s
            }

            if settings.youtube_cookies_file and os.path.exists(settings.youtube_cookies_file):
                ydl_opts['cookiefile'] = settings.youtube_cookies_file
                logger.info(f"Using YouTube cookies from: {settings.youtube_cookies_file}")
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract info without downloading first
                info = ydl.extract_info(url, download=False)
                
                if not info:
                    raise Exception("Failed to extract video information")
                
                video_title = info.get('title', 'Unknown')
                duration = info.get('duration', 0)
                
                logger.info(f"Video info - Title: {video_title}, Duration: {duration}s")
                
                # Now download
                ydl.download([url])
                
                # Verify download
                if not os.path.exists(output_path):
                    raise Exception(f"Downloaded file not found at: {output_path}")
                
                file_size = os.path.getsize(output_path)
                
                logger.info(f"✓ Successfully downloaded YouTube video: {video_title} ({file_size / (1024*1024):.2f} MB)")
                
                return {
                    'filepath': output_path,
                    'title': video_title,
                    'duration': duration,
                    'file_size': file_size,
                    'video_id': info.get('id'),
                    'uploader': info.get('uploader'),
                    'description': info.get('description'),
                    'upload_date': info.get('upload_date'),
                    'view_count': info.get('view_count'),
                    'like_count': info.get('like_count'),
                    'thumbnail': info.get('thumbnail'),
                }
                
        except Exception as e:
            logger.error(f"Failed to download YouTube video: {e}", exc_info=True)
            raise Exception(f"YouTube download failed: {str(e)}")
    
    def get_video_info(self, url: str) -> Optional[dict]:
        """
        Get video information without downloading
        
        Args:
            url: YouTube video URL
            
        Returns:
            dict: Video metadata (title, duration, formats, etc.)
        """
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'extractor_args': {
                    'youtube': {
                        'player_client': settings.youtube_player_client.split(','),
                    }
                },
            }

            if settings.youtube_cookies_file and os.path.exists(settings.youtube_cookies_file):
                ydl_opts['cookiefile'] = settings.youtube_cookies_file

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info
                
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None

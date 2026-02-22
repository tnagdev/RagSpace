import logging
import os
from typing import Optional
import yt_dlp

logger = logging.getLogger(__name__)


class YouTubeDownloaderService:
    """Service for downloading YouTube videos using yt-dlp"""
    
    def __init__(self, cookie_browser: Optional[str] = None):
        """
        Initialize the YouTube downloader service
        
        Args:
            cookie_browser: Browser to extract cookies from ('chrome', 'firefox', 'edge', 'safari', etc.)
                          Set to None to disable cookie extraction (recommended for Docker)
        """
        self.cookie_browser = cookie_browser
        self._cookie_extraction_failed = False
        
    def _get_base_options(self, use_cookies: bool = True) -> dict:
        """
        Get base yt-dlp options with anti-bot measures
        
        Args:
            use_cookies: Whether to attempt cookie extraction (disabled after first failure)
        """
        options = {
            'quiet': False,
            'no_warnings': False,
            'nocheckcertificate': True,
            'ignoreerrors': False,
            # Use realistic user-agent
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            # Add referer to appear like normal browsing
            'referer': 'https://www.youtube.com/',
            # Additional headers
            'http_headers': {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            },
        }
        
        # Only attempt cookie extraction if:
        # 1. Cookies are enabled (use_cookies=True)
        # 2. Browser is specified
        # 3. Previous attempts haven't failed
        if use_cookies and self.cookie_browser and not self._cookie_extraction_failed:
            options['cookiesfrombrowser'] = (self.cookie_browser,)
            logger.debug(f"Cookie extraction enabled for browser: {self.cookie_browser}")
        
        return options
    
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
        # First attempt with cookies (if available)
        last_error = None
        
        for attempt, use_cookies in enumerate([True, False], 1):
            # Skip cookie attempt if already failed or not configured
            if attempt == 1 and (self._cookie_extraction_failed or not self.cookie_browser):
                continue
                
            try:
                logger.info(f"YouTube download attempt {attempt}: {url} (cookies={'enabled' if use_cookies else 'disabled'})")
                
                # Ensure output directory exists
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                
                # yt-dlp options for minimal quality download with anti-bot measures
                ydl_opts = {
                    **self._get_base_options(use_cookies=use_cookies),
                    'format': quality,  # Download lowest quality to save bandwidth
                    'outtmpl': output_path,
                    'extract_flat': False,
                    'merge_output_format': 'mp4',
                    # Limit download speed (optional)
                    # 'ratelimit': 1000000,  # 1 MB/s
                }
                
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
                    }
                    
            except Exception as e:
                last_error = e
                error_msg = str(e).lower()
                
                # Check if error is related to cookies
                if 'cookie' in error_msg or 'browser' in error_msg:
                    logger.warning(f"Cookie extraction failed: {e}")
                    self._cookie_extraction_failed = True
                    # Continue to next attempt without cookies
                    continue
                else:
                    # Non-cookie error, raise immediately
                    logger.error(f"Failed to download YouTube video: {e}", exc_info=True)
                    raise Exception(f"YouTube download failed: {str(e)}")
        
        # If we get here, all attempts failed
        logger.error(f"All download attempts failed. Last error: {last_error}")
        raise Exception(f"YouTube download failed after all attempts: {str(last_error)}")
    
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
                **self._get_base_options(use_cookies=False),  # Disable cookies for info extraction
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info
                
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None

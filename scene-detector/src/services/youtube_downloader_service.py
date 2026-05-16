import logging
import os
import shutil
import tempfile
from typing import Optional
import yt_dlp
from src.config.settings import settings

logger = logging.getLogger(__name__)

_BOT_DETECTION_PHRASES = ('Sign in to confirm', 'not a bot')

_BASE_YDL_OPTS = {
    'quiet': False,
    'no_warnings': False,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'no_color': True,
    'extractor_args': {'youtube': {'player_client': ['tv', 'web_embedded']}},
}


def _copy_cookies_to_tmp() -> Optional[str]:
    src = settings.youtube_cookies_file
    if not (src and os.path.exists(src)):
        return None
    tmp = tempfile.NamedTemporaryFile(suffix='.txt', delete=False, dir='/tmp')
    tmp.close()
    shutil.copy2(src, tmp.name)
    return tmp.name


class YouTubeDownloaderService:
    """Service for downloading YouTube videos using yt-dlp"""

    async def download_video(
        self,
        url: str,
        output_path: str,
        quality: str = 'worst[height<=480]/worst/best[height<=480]/best'
    ) -> dict:
        try:
            logger.info(f"Starting YouTube download: {url}")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            ydl_opts = {**_BASE_YDL_OPTS, 'format': quality, 'outtmpl': output_path}

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if not info:
                        raise Exception("Failed to extract video information")
            except Exception as first_err:
                is_bot_error = any(p in str(first_err) for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                logger.warning("Cookieless attempt blocked, retrying with cookies")
                cookie_opts = {**ydl_opts, 'cookiefile': cookies_tmp}
                with yt_dlp.YoutubeDL(cookie_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if not info:
                        raise Exception("Failed to extract video information")

            if not os.path.exists(output_path):
                raise Exception(f"Downloaded file not found at: {output_path}")

            file_size = os.path.getsize(output_path)
            video_title = info.get('title', 'Unknown')
            duration = info.get('duration', 0)
            logger.info(f"✓ Successfully downloaded: {video_title} ({file_size / (1024*1024):.2f} MB)")

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
        try:
            base = {**_BASE_YDL_OPTS, 'quiet': True, 'no_warnings': True}
            try:
                with yt_dlp.YoutubeDL(base) as ydl:
                    return ydl.extract_info(url, download=False)
            except Exception as e:
                is_bot_error = any(p in str(e) for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                with yt_dlp.YoutubeDL({**base, 'cookiefile': cookies_tmp}) as ydl:
                    return ydl.extract_info(url, download=False)
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None

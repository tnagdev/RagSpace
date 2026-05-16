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
    'extract_flat': False,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'no_color': True,
    'merge_output_format': 'mp4',
    'extractor_args': {
        'youtube': {
            'player_client': ['web_embedded', 'android_vr'],
        }
    },
}


def _copy_cookies_to_tmp() -> Optional[str]:
    """Copy the cookie file to /tmp so yt-dlp can write back to it."""
    src = settings.youtube_cookies_file
    if not (src and os.path.exists(src)):
        return None
    tmp = tempfile.NamedTemporaryFile(suffix='.txt', delete=False, dir='/tmp')
    tmp.close()
    shutil.copy2(src, tmp.name)
    return tmp.name


class YouTubeDownloaderService:
    """Service for downloading YouTube videos using yt-dlp"""

    def _run_ydl(self, url: str, ydl_opts: dict, download: bool) -> dict:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=download)
            if not info:
                raise Exception("Failed to extract video information")
            if download:
                ydl.download([url])
            return info

    async def download_video(
        self,
        url: str,
        output_path: str,
        quality: str = 'bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best'
    ) -> dict:
        try:
            logger.info(f"Starting YouTube download: {url}")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            opts = {**_BASE_YDL_OPTS, 'format': quality, 'outtmpl': output_path}

            # Always try WITHOUT cookies first — passing stale cookies triggers
            # stricter bot detection than no credentials at all.
            active_opts = opts
            try:
                info = self._run_ydl(url, opts, download=False)
            except Exception as first_err:
                is_bot_error = any(p in str(first_err) for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                logger.warning(f"Cookieless attempt blocked, retrying with cookies")
                active_opts = {**opts, 'cookiefile': cookies_tmp}
                info = self._run_ydl(url, active_opts, download=False)

            video_title = info.get('title', 'Unknown')
            duration = info.get('duration', 0)
            logger.info(f"Video info - Title: {video_title}, Duration: {duration}s")

            self._run_ydl(url, active_opts, download=True)

            if not os.path.exists(output_path):
                raise Exception(f"Downloaded file not found at: {output_path}")

            file_size = os.path.getsize(output_path)
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
            opts = {**_BASE_YDL_OPTS, 'quiet': True, 'no_warnings': True}
            try:
                return self._run_ydl(url, opts, download=False)
            except Exception as e:
                is_bot_error = any(p in str(e) for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                return self._run_ydl(url, {**opts, 'cookiefile': cookies_tmp}, download=False)
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None

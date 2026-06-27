import asyncio
import logging
import os
import shutil
import tempfile
from typing import Optional
import yt_dlp
from src.config.settings import settings

logger = logging.getLogger(__name__)

_BOT_DETECTION_PHRASES = ('Sign in to confirm', 'not a bot')

_PERMANENT_ERROR_PHRASES = (
    'Video unavailable',
    'This video is not available',
    'age-restricted',
    'members-only',
    'Private video',
    'This video has been removed',
    'copyright',
    'removed by the uploader',
    'confirm your age',
    'not available in your country',
    'DRM protected',
)

_BASE_YDL_OPTS = {
    'quiet': False,
    'no_warnings': False,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'no_color': False,
    'socket_timeout': 30,
    'merge_output_format': 'mp4',
    'extractor_args': {'youtube': {'player_client': ['web_embedded', 'mweb', 'android_vr']}},
}


def _copy_cookies_to_tmp() -> Optional[str]:
    src = settings.youtube_cookies_file
    logger.info(f"Cookie file configured: {src!r}, exists: {os.path.exists(src) if src else False}")
    if not (src and os.path.exists(src)):
        logger.warning(f"Cookie file not found, skipping cookie retry (path={src!r})")
        return None
    tmp = tempfile.NamedTemporaryFile(suffix='.txt', delete=False, dir='/tmp')
    tmp.close()
    shutil.copy2(src, tmp.name)
    logger.info(f"Copied cookies to {tmp.name}")
    return tmp.name


class YouTubeDownloaderService:
    """Service for downloading YouTube videos using yt-dlp"""

    async def download_video(
        self,
        url: str,
        output_path: str,
        quality: Optional[str] = None,
    ) -> dict:
        format_selector = quality or settings.youtube_format_selector
        try:
            logger.info(f"Starting YouTube download: {url}")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            ydl_opts = {**_BASE_YDL_OPTS, 'format': format_selector, 'outtmpl': output_path}

            def _run_download(opts):
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if not info:
                        raise Exception("Failed to extract video information")
                    return info

            try:
                info = await asyncio.to_thread(_run_download, ydl_opts)
            except Exception as first_err:
                err_str = str(first_err)
                if any(p in err_str for p in _PERMANENT_ERROR_PHRASES):
                    raise Exception(f"Video cannot be downloaded: {err_str}") from first_err
                is_bot_error = any(p in err_str for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                logger.warning("Cookieless attempt blocked, retrying with cookies")
                info = await asyncio.to_thread(_run_download, {**ydl_opts, 'cookiefile': cookies_tmp})

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

    async def get_video_info(self, url: str) -> Optional[dict]:
        try:
            base = {**_BASE_YDL_OPTS, 'quiet': True, 'no_warnings': True}

            def _run_info(opts):
                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=False)

            try:
                return await asyncio.to_thread(_run_info, base)
            except Exception as e:
                err_str = str(e)
                if any(p in err_str for p in _PERMANENT_ERROR_PHRASES):
                    raise
                is_bot_error = any(p in err_str for p in _BOT_DETECTION_PHRASES)
                cookies_tmp = _copy_cookies_to_tmp() if is_bot_error else None
                if not cookies_tmp:
                    raise
                return await asyncio.to_thread(_run_info, {**base, 'cookiefile': cookies_tmp})
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None

import logging
import os
import asyncio
from typing import Optional
import httpx
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, BotoCoreError
from src.decorators.singleton import SingletonMeta
from src.config import settings

logger = logging.getLogger(__name__)


class S3ClientService(metaclass=SingletonMeta):
    """S3/MinIO client for downloading and managing files."""
    
    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket_name: Optional[str] = None
    ) -> None:
        # Skip if already initialized (prevents duplicate initialization)
        if hasattr(self, '_s3_client_initialized'):
            return
        
        self._s3_client_initialized = True
        
        # Use provided values or fall back to settings
        self.endpoint = (endpoint or settings.aws_s3_endpoint or '').rstrip('/')
        self.access_key = access_key or settings.aws_access_key_id
        self.secret_key = secret_key or settings.aws_secret_access_key
        self.bucket_name = bucket_name or settings.aws_s3_bucket
        self.region = settings.aws_region
        
        # Configure boto3 client
        config = Config(
            region_name=self.region,
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'standard'},
            request_checksum_calculation='when_required'
        )
        
        client_kwargs = {
            'config': config,
            'aws_access_key_id': self.access_key,
            'aws_secret_access_key': self.secret_key
        }
        
        if self.endpoint:
            client_kwargs['endpoint_url'] = self.endpoint
        
        self.s3_client = boto3.client('s3', **client_kwargs)
        logger.info(f"S3 client initialized (endpoint: {self.endpoint or 'AWS'}, bucket: {self.bucket_name})")
    
    
    async def download_from_url(self, url: str, local_path: str) -> str:
        """Download a file from a URL or S3 path.
        
        If URL contains S3 path structure, extract the key and use boto3.
        Otherwise, download directly from URL.
        
        Args:
            url: Full URL to download from
            local_path: Local path to save the file
            
        Returns:
            Local file path
        """
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        logger.info(f"Downloading from: {url[:100]}...")
        
        try:
            # Check if this is an S3 URL we can parse
            if '/storage/v1/s3/' in url and self.s3_client:
                # Extract S3 key from URL format: https://.../storage/v1/s3/bucket/path/to/file
                parts = url.split('/storage/v1/s3/')
                if len(parts) == 2:
                    path_parts = parts[1].split('/', 1)
                    if len(path_parts) == 2:
                        bucket = path_parts[0]
                        # Remove query parameters from S3 key (e.g., signed URL params)
                        s3_key = path_parts[1].split('?')[0]
                        
                        logger.info(f"Downloading from S3: s3://{bucket}/{s3_key}")
                        
                        await asyncio.to_thread(self.s3_client.download_file, bucket, s3_key, local_path)
                        
                        file_size = os.path.getsize(local_path)
                        logger.info(f"\u2713 Downloaded {file_size:,} bytes to: {local_path}")
                        return local_path
            
            # Stream HTTP download — never loads entire response into memory
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(settings.s3_download_timeout_seconds, connect=10.0)
            ) as client:
                async with client.stream('GET', url, follow_redirects=True) as response:
                    response.raise_for_status()
                    total_bytes = 0
                    with open(local_path, 'wb') as f:
                        async for chunk in response.aiter_bytes(chunk_size=8 * 1024 * 1024):
                            f.write(chunk)
                            total_bytes += len(chunk)
                    logger.info(f"\u2713 Downloaded {total_bytes:,} bytes to: {local_path}")
                    return local_path
                
        except (ClientError, BotoCoreError) as e:
            logger.error(f"S3 download failed: {e}")
            raise
        except httpx.HTTPError as e:
            logger.error(f"HTTP download failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            raise    
    
    async def download_file(self, s3_key: str, local_path: str) -> str:
        """Download a file from S3 using the configured bucket.
        
        Note: This may not work with private buckets. Use download_from_url with signed URLs instead.
        
        Args:
            s3_key: S3 object key (path in bucket)
            local_path: Local path to save the file
            
        Returns:
            Local file path
        """
        # Construct download URL
        url = f"{self.endpoint}/{self.bucket_name}/{s3_key}"
        return await self.download_from_url(url, local_path)
    
    async def download(self, s3_url: Optional[str], s3_key: str, local_path: str) -> str:
        """Download a file using either a signed URL or S3 key.
        
        Args:
            s3_url: Optional signed URL (preferred if available)
            s3_key: S3 object key (fallback if URL not provided)
            local_path: Local destination path
            
        Returns:
            Local file path
        """
        if s3_url:
            return await self.download_from_url(s3_url, local_path)
        else:
            return await self.download_file(s3_key, local_path)
    
    def get_file_url(self, s3_key: str) -> str:
        """Get the public URL for an S3 object.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            Public URL string
        """
        return f"{self.endpoint}/{self.bucket_name}/{s3_key}"

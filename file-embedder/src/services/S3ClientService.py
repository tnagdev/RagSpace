import logging;
import httpx
import os
from typing import Optional
import logging
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from src.decorators.singleton import singleton
from src.config import settings


logger = logging.getLogger(__name__)

@singleton
class S3ClientService:
    """Simple S3/MinIO client for downloading files."""
    
    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket_name: str
    ):
        self.endpoint = endpoint.rstrip('/')
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket_name = bucket_name
        
        config = Config(
            region_name=settings.aws_region,
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'standard'}
        )

        client_kwargs = {
            'config': config,
            'aws_access_key_id': self.access_key,
            'aws_secret_access_key': self.secret_key
        }

        if self.endpoint:
            client_kwargs['endpoint_url'] = self.endpoint

        self.s3_client = boto3.client('s3', **client_kwargs)
        logger.info(f"Initialized S3 client for endpoint: {self.endpoint}")
    

    async def download_from_url(self, url: str, local_path: str) -> str:
        """
        Download a file from a URL or S3 path.
        If URL contains S3 path structure, extract the key and use boto3.
        Otherwise, download directly from URL.

        Args:
            url: Full URL to download from
            local_path: Local path to save the file

        Returns:
            Local file path
        """
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        logger.info(f"Downloading file from URL: {url[:100]}...")

        try:
            if '/storage/v1/s3/' in url and self.s3_client:
                # Extract S3 key from URL
                # URL format: https://.../storage/v1/s3/bucket/path/to/file
                parts = url.split('/storage/v1/s3/')
                if len(parts) == 2:
                    # Remove bucket name from path and get the key
                    path_parts = parts[1].split('/', 1)
                    if len(path_parts) == 2:
                        bucket = path_parts[0]
                        # Remove query parameters from S3 key (e.g., signed URL params)
                        s3_key_with_params = path_parts[1]
                        s3_key = s3_key_with_params.split('?')[0]  # Strip query params
                        
                        logger.info(f"Downloading from S3 bucket '{bucket}': {s3_key}")
                        
                        # Use boto3 to download
                        self.s3_client.download_file(bucket, s3_key, local_path)
                        logger.info(f"Downloaded file to: {local_path}")
                        return local_path
            
            # Fallback to direct URL download for non-S3 URLs
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.get(url, follow_redirects=True)
                response.raise_for_status()

                # Write to file
                with open(local_path, 'wb') as f:
                    f.write(response.content)

                logger.info(f"Downloaded file to: {local_path}")
                return local_path

        except (ClientError, httpx.HTTPError) as e:
            logger.error(f"Failed to download file: {e}")
            raise    
        
    async def download_file(self, s3_key: str, local_path: str) -> str:
        """
        Download a file from S3 to local storage using constructed URL.
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
    
    async def download(self, s3_url: str, s3_key: str, local_path: str) -> str:
        if (s3_url):
            return await self.download_from_url(s3_url, local_path)
        else:
            return await self.download_file(s3_key, local_path)
    
    def get_file_url(self, s3_key: str) -> str:
        """
        Get the public URL for an S3 object.
        
        Args:
            s3_key: S3 object key
            
        Returns:
            Public URL
        """
        return f"{self.endpoint}/{self.bucket_name}/{s3_key}"

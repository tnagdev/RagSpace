import logging
import os
from typing import Optional
import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError
from src.decorators.singleton import singleton

from src.config.settings import settings

logger = logging.getLogger(__name__)


@singleton
class S3Service:
    """AWS S3 service for file operations"""
    
    def __init__(self):
        self.bucket = settings.aws_s3_bucket
        self.session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region
        )
        self.endpoint_url = settings.aws_s3_endpoint
        # Config for Supabase S3 compatibility
        self.client_config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'}
        )
    
    def _get_client_config(self):
        """Get client configuration for S3 operations"""
        config = {'config': self.client_config}
        if self.endpoint_url:
            config['endpoint_url'] = self.endpoint_url
        return config
    
    
    async def download_file(self, s3_key: str, local_path: str, bucket: Optional[str] = None) -> str:
        """Download a file from S3 to local path"""
        try:
            download_bucket = bucket or self.bucket
            logger.info(f"Downloading file from S3 bucket '{download_bucket}': {s3_key}")

            # Ensure directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            async with self.session.client('s3', **self._get_client_config()) as s3_client:
                response = await s3_client.get_object(Bucket=download_bucket, Key=s3_key)
                async with response['Body'] as stream:
                    data = await stream.read()
                    with open(local_path, 'wb') as f:
                        f.write(data)

            logger.info(f"Downloaded file to: {local_path}")
            return local_path

        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise    
        
    async def upload_file(self, local_path: str, s3_key: str, content_type: str = 'image/jpeg', bucket: str = None) -> str:
        """Upload a file to S3"""
        try:
            upload_bucket = bucket or self.bucket
            logger.info(f"Uploading file to S3 bucket '{upload_bucket}': {s3_key}")
            
            with open(local_path, 'rb') as f:
                file_data = f.read()
            
            async with self.session.client('s3', **self._get_client_config()) as s3_client:
                await s3_client.put_object(
                    Bucket=upload_bucket,
                    Key=s3_key,
                    Body=file_data,
                    ContentType=content_type,
                    Metadata={
                        'uploadedBy': 'scene-detector-service'
                    }
                )
            
            if self.endpoint_url:
                url = f"{self.endpoint_url}/{upload_bucket}/{s3_key}"
            else:
                url = f"https://{upload_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Uploaded file to S3: {url}")
            return url
            
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            raise
    
    async def upload_bytes(self, data: bytes, s3_key: str, content_type: str = 'image/jpeg', bucket: str = None) -> str:
        """Upload bytes data to S3"""
        try:
            upload_bucket = bucket or self.bucket
            
            async with self.session.client('s3', **self._get_client_config()) as s3_client:
                await s3_client.put_object(
                    Bucket=upload_bucket,
                    Key=s3_key,
                    Body=data,
                    ContentType=content_type,
                    Metadata={
                        'uploadedBy': 'scene-detector-service'
                    }
                )
            
            if self.endpoint_url:
                url = f"{self.endpoint_url}/{upload_bucket}/{s3_key}"
            else:
                url = f"https://{upload_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Uploaded bytes to S3: {url}")
            return url
            
        except ClientError as e:
            logger.error(f"Failed to upload bytes to S3: {e}")
            raise
    
    async def get_signed_url(self, s3_key: str, expiration: int = 3600, bucket: Optional[str] = None) -> str:
        """Generate a signed URL for an S3 object"""
        target_bucket = bucket or self.bucket
        try:
            async with self.session.client('s3', **self._get_client_config()) as s3_client:
                url = await s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': target_bucket, 'Key': s3_key},
                    ExpiresIn=expiration
                )
                return url
        except ClientError as e:
            logger.error(f"Failed to generate signed URL: {e}")
            raise

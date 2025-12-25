import logging
import os
from typing import Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from src.decorators.singleton import singleton

from src.config.settings import settings

logger = logging.getLogger(__name__)


@singleton
class S3Service:
    """AWS S3 service for file operations"""
    
    def __init__(self):
        self.s3_client = None
        self.bucket = settings.aws_s3_bucket
        self._init_client()
    
    def _init_client(self):
        """Initialize S3 client"""
        config = Config(
            region_name=settings.aws_region,
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'standard'}
        )
        
        client_kwargs = {
            'config': config
        }
        
        # Add credentials if provided
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            client_kwargs['aws_access_key_id'] = settings.aws_access_key_id
            client_kwargs['aws_secret_access_key'] = settings.aws_secret_access_key
        
        # Add custom endpoint if provided (for MinIO)
        if settings.aws_s3_endpoint:
            client_kwargs['endpoint_url'] = settings.aws_s3_endpoint
        
        self.s3_client = boto3.client('s3', **client_kwargs)
        logger.info(f"S3 client initialized for bucket: {self.bucket}")
    
    
    async def download_file(self, s3_key: str, local_path: str, bucket: Optional[str] = None) -> str:
        """Download a file from S3 to local path"""
        try:
            download_bucket = bucket or self.bucket
            logger.info(f"Downloading file from S3 bucket '{download_bucket}': {s3_key}")

            # Ensure directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            # Download file
            self.s3_client.download_file(
                download_bucket,
                s3_key,
                local_path
            )

            logger.info(f"Downloaded file to: {local_path}")
            return local_path

        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise    
        
    async def upload_file(self, local_path: str, s3_key: str, content_type: str = 'image/jpeg', bucket: str = None) -> str:
        """Upload a file to S3"""
        try:
            logger.info(f"Uploading file to S3: {s3_key}")
            
            # Upload file
            self.s3_client.upload_file(
                local_path,
                bucket or self.bucket,
                s3_key,
                ExtraArgs={
                    'ContentType': content_type,
                    'Metadata': {
                        'uploadedBy': 'file-embedder-service'
                    }
                }
            )
            
            if settings.aws_s3_endpoint:
                url = f"{settings.aws_s3_endpoint}/{self.bucket}/{s3_key}"
            else:
                url = f"https://{self.bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Uploaded file to S3: {url}")
            return url
            
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            raise
    
    async def upload_bytes(self, data: bytes, s3_key: str, content_type: str = 'image/jpeg') -> str:
        """Upload bytes data to S3"""
        try:
            logger.info(f"Uploading bytes to S3: {s3_key}")
            
            # Upload bytes
            self.s3_client.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=data,
                ContentType=content_type,
                Metadata={
                    'uploadedBy': 'file-embedder-service'
                }
            )
            
            # Generate URL
            if settings.aws_s3_endpoint:
                url = f"{settings.aws_s3_endpoint}/{self.bucket}/{s3_key}"
            else:
                url = f"https://{self.bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
            
            logger.info(f"Uploaded bytes to S3: {url}")
            return url
            
        except ClientError as e:
            logger.error(f"Failed to upload bytes to S3: {e}")
            raise
    
    def get_signed_url(self, s3_key: str, expiration: int = 3600) -> str:
        """Generate a signed URL for an S3 object"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': s3_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate signed URL: {e}")
            raise

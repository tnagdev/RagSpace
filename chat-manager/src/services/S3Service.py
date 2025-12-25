"""S3 service for generating signed URLs"""
import logging
from typing import Optional, Dict, Tuple
import aioboto3
from src.config import settings
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)


@singleton
class S3Service:
    """Service for S3 operations including signed URL generation"""
    
    def __init__(self):
        self.session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region
        )
        self.default_bucket = settings.s3_file_bucket_name
        self.url_expiration = settings.s3_url_expiration  # seconds
        self.endpoint_url = settings.s3_endpoint_url  # For MinIO/local S3
    
    async def get_signed_url(self, s3_key: str, bucket: Optional[str] = None) -> Optional[str]:
        """
        Generate a pre-signed URL for an S3 object.
        
        Args:
            s3_key: The S3 object key
            bucket: Optional bucket name (uses default if not specified)
            
        Returns:
            Pre-signed URL or None if failed
        """
        if not s3_key:
            return None
        
        use_bucket = bucket or self.default_bucket
        
        try:
            client_config = {}
            if self.endpoint_url:
                client_config['endpoint_url'] = self.endpoint_url
            
            async with self.session.client('s3', **client_config) as s3_client:
                url = await s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': use_bucket,
                        'Key': s3_key
                    },
                    ExpiresIn=self.url_expiration
                )
                return url
        except Exception as e:
            logger.error(f"Error generating signed URL for {s3_key} in bucket {use_bucket}: {e}")
            return None
    
    async def get_signed_urls_batch(self, s3_items: list[Tuple[str, Optional[str]]]) -> Dict[str, str]:
        """
        Generate pre-signed URLs for multiple S3 objects.
        
        Args:
            s3_items: List of (s3_key, bucket) tuples
            
        Returns:
            Dictionary mapping s3_key to signed URL
        """
        result = {}
        
        if not s3_items:
            return result
        
        try:
            client_config = {}
            if self.endpoint_url:
                client_config['endpoint_url'] = self.endpoint_url
            
            async with self.session.client('s3', **client_config) as s3_client:
                for key, bucket in s3_items:
                    if key:
                        use_bucket = bucket or self.default_bucket
                        try:
                            url = await s3_client.generate_presigned_url(
                                'get_object',
                                Params={
                                    'Bucket': use_bucket,
                                    'Key': key
                                },
                                ExpiresIn=self.url_expiration
                            )
                            result[key] = url
                        except Exception as e:
                            logger.warning(f"Failed to generate URL for {key} in bucket {use_bucket}: {e}")
        except Exception as e:
            logger.error(f"Error generating batch signed URLs: {e}")
        
        return result

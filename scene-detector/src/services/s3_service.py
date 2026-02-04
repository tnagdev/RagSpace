import logging
import os
from typing import Optional, Dict
from contextlib import asynccontextmanager
import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError
from src.decorators.singleton import singleton
from src.config.settings import settings

logger = logging.getLogger(__name__)


@singleton
class S3Service:
    """AWS S3 service for file operations with connection pooling."""
    
    def __init__(self) -> None:
        self.bucket: str = settings.aws_s3_bucket
        self.region: str = settings.aws_region
        self.endpoint_url: Optional[str] = settings.aws_s3_endpoint
        
        self.session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=self.region
        )
        
        self.client_config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'},
            request_checksum_calculation='when_required'
        )
        
        logger.info(f"S3 Service initialized (bucket: {self.bucket}, region: {self.region})")
    
    @asynccontextmanager
    async def _get_client(self):
        """Context manager for S3 client with automatic cleanup."""
        client_kwargs = {'config': self.client_config}
        if self.endpoint_url:
            client_kwargs['endpoint_url'] = self.endpoint_url
        
        async with self.session.client('s3', **client_kwargs) as client:
            yield client
    
    def _build_s3_url(self, bucket: str, key: str) -> str:
        """Build S3 URL for uploaded file.
        
        Args:
            bucket: S3 bucket name
            key: S3 object key
            
        Returns:
            Full URL to the S3 object
        """
        if self.endpoint_url:
            return f"{self.endpoint_url}/{bucket}/{key}"
        return f"https://{bucket}.s3.{self.region}.amazonaws.com/{key}"
    
    async def download_file(
        self,
        s3_key: str,
        local_path: str,
        bucket: Optional[str] = None
    ) -> str:
        """Download a file from S3 to local filesystem.
        
        Args:
            s3_key: S3 object key
            local_path: Local destination path
            bucket: Optional bucket name (uses default if not provided)
            
        Returns:
            Path to downloaded file
        """
        download_bucket = bucket or self.bucket
        
        try:
            logger.info(f"Downloading: s3://{download_bucket}/{s3_key}")
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            async with self._get_client() as s3_client:
                response = await s3_client.get_object(
                    Bucket=download_bucket,
                    Key=s3_key
                )
                
                async with response['Body'] as stream:
                    data = await stream.read()
                    with open(local_path, 'wb') as f:
                        f.write(data)
            
            file_size = os.path.getsize(local_path)
            logger.info(f"✓ Downloaded {file_size:,} bytes to: {local_path}")
            return local_path
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            logger.error(f"S3 download failed ({error_code}): {s3_key}")
            raise
        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            raise

    async def upload_file(
        self,
        local_path: str,
        s3_key: str,
        content_type: str = 'image/jpeg',
        bucket: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """Upload a file to S3.
        
        Args:
            local_path: Local file path to upload
            s3_key: Destination S3 object key
            content_type: MIME type of the file
            bucket: Optional bucket name (uses default if not provided)
            metadata: Optional metadata dictionary
            
        Returns:
            URL of the uploaded file
        """
        upload_bucket = bucket or self.bucket
        
        try:
            logger.info(f"Uploading to: s3://{upload_bucket}/{s3_key}")
            
            with open(local_path, 'rb') as f:
                file_data = f.read()
            
            upload_metadata = metadata or {}
            upload_metadata.setdefault('uploadedby', 'scene-detector-service')
            
            async with self._get_client() as s3_client:
                await s3_client.put_object(
                    Bucket=upload_bucket,
                    Key=s3_key,
                    Body=file_data,
                    ContentType=content_type,
                    Metadata=upload_metadata
                )
            
            url = self._build_s3_url(upload_bucket, s3_key)
            file_size = len(file_data)
            logger.info(f"✓ Uploaded {file_size:,} bytes: {url}")
            return url
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            logger.error(f"S3 upload failed ({error_code}): {s3_key}")
            raise
        except FileNotFoundError:
            logger.error(f"Local file not found: {local_path}")
            raise
        except Exception as e:
            logger.error(f"Upload error: {e}", exc_info=True)
            raise
        
    async def upload_bytes(
        self,
        data: bytes,
        s3_key: str,
        content_type: str = 'image/jpeg',
        bucket: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """Upload bytes data directly to S3.
        
        Args:
            data: Bytes to upload
            s3_key: Destination S3 object key
            content_type: MIME type of the data
            bucket: Optional bucket name (uses default if not provided)
            metadata: Optional metadata dictionary
            
        Returns:
            URL of the uploaded file
        """
        upload_bucket = bucket or self.bucket
        
        try:
            logger.info(f"Uploading {len(data):,} bytes to: s3://{upload_bucket}/{s3_key}")
            
            # Prepare metadata
            upload_metadata = metadata or {}
            upload_metadata.setdefault('uploadedby', 'scene-detector-service')
            
            # Upload to S3
            async with self._get_client() as s3_client:
                await s3_client.put_object(
                    Bucket=upload_bucket,
                    Key=s3_key,
                    Body=data,
                    ContentType=content_type,
                    Metadata=upload_metadata
                )
            
            # Build URL
            url = self._build_s3_url(upload_bucket, s3_key)
            logger.info(f"✓ Uploaded: {url}")
            return url
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            logger.error(f"S3 bytes upload failed ({error_code}): {s3_key}")
            raise
        except Exception as e:
            logger.error(f"Bytes upload error: {e}", exc_info=True)
            raise
    
    async def delete_file(
        self,
        s3_key: str,
        bucket: Optional[str] = None
    ) -> bool:
        """Delete a file from S3.
        
        Args:
            s3_key: S3 object key to delete
            bucket: Optional bucket name (uses default if not provided)
            
        Returns:
            True if successful
        """
        delete_bucket = bucket or self.bucket
        
        try:
            logger.info(f"Deleting: s3://{delete_bucket}/{s3_key}")
            
            async with self._get_client() as s3_client:
                await s3_client.delete_object(
                    Bucket=delete_bucket,
                    Key=s3_key
                )
            
            logger.info(f"✓ Deleted: {s3_key}")
            return True
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            if error_code == 'NoSuchKey':
                logger.warning(f"File not found for deletion: {s3_key}")
                return True  # Consider it successful if already gone
            
            logger.error(f"S3 delete failed ({error_code}): {s3_key}")
            return False
        except Exception as e:
            logger.error(f"Delete error: {e}", exc_info=True)
            return False
    
    async def delete_files_batch(
        self,
        s3_keys: list[str],
        bucket: Optional[str] = None
    ) -> int:
        """Delete multiple files from S3 individually.
        
        Args:
            s3_keys: List of S3 object keys to delete
            bucket: Optional bucket name (uses default if not provided)
            
        Returns:
            Number of files successfully deleted
        """
        if not s3_keys:
            return 0
        
        delete_bucket = bucket or self.bucket
        deleted_count = 0
        
        try:
            logger.info(f"Deleting {len(s3_keys)} files from S3")
            
            async with self._get_client() as s3_client:
                for key in s3_keys:
                    try:
                        await s3_client.delete_object(
                            Bucket=delete_bucket,
                            Key=key
                        )
                        deleted_count += 1
                    except ClientError as e:
                        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                        if error_code == 'NoSuchKey':
                            deleted_count += 1  # Consider missing files as successfully deleted
                        else:
                            logger.warning(f"Failed to delete {key}: {error_code}")
                    except Exception as e:
                        logger.warning(f"Failed to delete {key}: {e}")
            
            logger.info(f"✓ Deleted {deleted_count}/{len(s3_keys)} files from S3")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Delete operation error: {e}", exc_info=True)
            return deleted_count
    
    async def get_signed_url(
        self,
        s3_key: str,
        expiration: int = 3600,
        bucket: Optional[str] = None
    ) -> str:
        """Generate a presigned URL for temporary S3 object access.
        
        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 1 hour)
            bucket: Optional bucket name (uses default if not provided)
            
        Returns:
            Presigned URL string
        """
        target_bucket = bucket or self.bucket
        
        try:
            logger.info(f"Generating signed URL for: s3://{target_bucket}/{s3_key}")
            
            async with self._get_client() as s3_client:
                url = await s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': target_bucket, 'Key': s3_key},
                    ExpiresIn=expiration
                )
            
            logger.info(f"✓ Generated signed URL (expires in {expiration}s)")
            return url
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            logger.error(f"Failed to generate signed URL ({error_code}): {s3_key}")
            raise
        except Exception as e:
            logger.error(f"Signed URL generation error: {e}", exc_info=True)
            raise

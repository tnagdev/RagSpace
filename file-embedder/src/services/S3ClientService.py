import asyncio
import logging
import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from src.config import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)


class S3ClientService(metaclass=SingletonMeta):
    def __init__(self) -> None:
        config = Config(
            region_name=settings.aws_region,
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=10,
            read_timeout=120,
            retries={"max_attempts": 3, "mode": "standard"},
            request_checksum_calculation="when_required",
        )
        self.client = boto3.client(
            "s3",
            config=config,
            endpoint_url=settings.aws_s3_endpoint or None,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    async def download(self, bucket: str, key: str, local_path: str) -> str:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        try:
            await asyncio.wait_for(
                asyncio.to_thread(self.client.download_file, bucket or settings.aws_s3_bucket, key, local_path),
                timeout=settings.s3_download_timeout_seconds,
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                raise FileNotFoundError(f"s3://{bucket}/{key}") from error
            raise
        logger.info("Downloaded s3://%s/%s (%d bytes)", bucket, key, os.path.getsize(local_path))
        return local_path

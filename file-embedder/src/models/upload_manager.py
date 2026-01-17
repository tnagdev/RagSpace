from pydantic import BaseModel
from src.models.enums import FileType, ProcessingStatus, ProcessingStage


class UploadedFile(BaseModel):
    id: str
    userId: str
    filename: str
    originalFilename: str
    fileSize: int
    mimeType: str
    fileType: FileType
    s3Key: str
    s3Bucket: str
    s3Url: str
    uploadStatus:str
    processingStatus: ProcessingStatus
    processingStage: ProcessingStage
    metadata: dict = None
    errorMessage: str = None
    uploadedAt: str
    processingStartedAt: str = None
    processingCompletedAt: str = None
    createdAt: str
    updatedAt: str
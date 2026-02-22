import { FileType, UploadStatus, ProcessingStatus, ProcessingStage } from '@prisma/client';

export class FileResponseDto {
    id: string;
    userId: string;
    filename: string;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
    fileType: FileType;
    s3Key: string;
    s3Url?: string;
    s3Bucket?: string;
    thumbnailUrl?: string;
    thumbnailPath?: string;
    youtubeUrl?: string;
    uploadStatus: UploadStatus;
    processingStatus: ProcessingStatus;
    processingStage: ProcessingStage;
    createdAt: Date;
    updatedAt: Date;
    uploadedAt?: Date;
}

export class FileListResponseDto {
    files: FileResponseDto[];
    total: number;
    page: number;
    limit: number;
}

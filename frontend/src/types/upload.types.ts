// Backend enum types
export enum FileType {
    IMAGE = 'IMAGE',
    VIDEO = 'VIDEO',
    AUDIO = 'AUDIO',
    DOCUMENT = 'DOCUMENT',
    OTHER = 'OTHER',
}

export enum UploadStatus {
    PENDING = 'PENDING',
    UPLOADING = 'UPLOADING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

export enum ProcessingStatus {
    NOT_STARTED = 'NOT_STARTED',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
}

export enum ProcessingStage {
    UPLOAD = 'UPLOAD',
    EMBEDDING = 'EMBEDDING',
    SCENE_DETECTION = 'SCENE_DETECTION',
    INDEXING = 'INDEXING',
    COMPLETED = 'COMPLETED',
}

// Backend DTOs
export interface FileResponseDto {
    id: string;
    userId: string;
    filename: string;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
    fileType: FileType;
    s3Key: string;
    s3Url?: string;
    uploadStatus: UploadStatus;
    processingStatus: ProcessingStatus;
    processingStage: ProcessingStage;
    metadata?: any;
    errorMessage?: string;
    uploadedAt?: Date;
    processingStartedAt?: Date;
    processingCompletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface FileListResponseDto {
    files: FileResponseDto[];
    total: number;
    page: number;
    limit: number;
}

export interface GetFilesQueryDto {
    page?: number;
    limit?: number;
    uploadStatus?: UploadStatus;
    processingStatus?: ProcessingStatus;
    fileIds?: string;
}

export interface UpdateFileDto {
    filename?: string;
    metadata?: any;
}

export interface StorageStatsDto {
    usedBytes: number;
    totalBytes: number;
    usedGB: string;
    totalGB: number;
    usedPercentage: string;
    fileCount: number;
}

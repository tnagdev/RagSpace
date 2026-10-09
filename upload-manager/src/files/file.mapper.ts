import { FileType, Prisma } from '@prisma/client';
import { commonV1, filesV1, toProtoEnum } from '@ragspace/shared-ts';

export const FILE_SELECT = {
    id: true,
    userId: true,
    filename: true,
    originalFilename: true,
    fileSize: true,
    mimeType: true,
    fileType: true,
    s3Key: true,
    s3Bucket: true,
    thumbnailPath: true,
    youtubeUrl: true,
    uploadStatus: true,
    processingStatus: true,
    processingStage: true,
    metadata: true,
    errorMessage: true,
    processingRetryCount: true,
    multipartUploadId: true,
    uploadedAt: true,
    processingStartedAt: true,
    processingCompletedAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.FileSelect;

export type FileRecord = Prisma.FileGetPayload<{ select: typeof FILE_SELECT }>;

export interface FileUrls {
    downloadUrl?: string;
    thumbnailUrl?: string;
}

export function toProtoFile(file: FileRecord, urls: FileUrls = {}): filesV1.File {
    const attributes = file.metadata && typeof file.metadata === 'object' && !Array.isArray(file.metadata)
        ? (file.metadata as Record<string, unknown>)
        : {};
    return {
        id: file.id,
        userId: file.userId,
        name: file.filename,
        originalName: file.originalFilename,
        sizeBytes: Number(file.fileSize),
        mimeType: file.mimeType,
        type: toProtoEnum<commonV1.FileType>('FILE_TYPE', file.fileType),
        uploadStatus: toProtoEnum<commonV1.UploadStatus>('UPLOAD_STATUS', file.uploadStatus),
        processingStatus: toProtoEnum<commonV1.ProcessingStatus>('PROCESSING_STATUS', file.processingStatus),
        processingStage: toProtoEnum<commonV1.ProcessingStage>('PROCESSING_STAGE', file.processingStage),
        errorMessage: file.errorMessage ?? undefined,
        processingRetryCount: file.processingRetryCount,
        youtubeUrl: file.youtubeUrl ?? undefined,
        attributes,
        storage: { bucket: file.s3Bucket, key: file.s3Key, thumbnailKey: file.thumbnailPath ?? undefined },
        downloadUrl: urls.downloadUrl,
        thumbnailUrl: urls.thumbnailUrl,
        createTime: file.createdAt,
        updateTime: file.updatedAt,
        uploadCompleteTime: file.uploadedAt ?? undefined,
        processingStartTime: file.processingStartedAt ?? undefined,
        processingCompleteTime: file.processingCompletedAt ?? undefined,
    };
}

export function fileTypeForMime(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) return FileType.IMAGE;
    if (mimeType.startsWith('video/')) return FileType.VIDEO;
    if (mimeType.startsWith('audio/')) return FileType.AUDIO;
    if (/pdf|document|text|msword|wordprocessing|spreadsheet|presentation/.test(mimeType)) return FileType.DOCUMENT;
    return FileType.OTHER;
}

import { Injectable } from '@nestjs/common';
import { FileType, ProcessingStage, ProcessingStatus, UploadStatus } from '@prisma/client';
import { assertBatchSize, filesV1, fromProtoEnum } from '@ragspace/shared-ts';
import { FilesService } from './files.service';

@Injectable()
export class FilesRpcService implements filesV1.FileServiceImplementation {
    constructor(private readonly files: FilesService) { }

    async getFile(request: filesV1.GetFileRequest): Promise<filesV1.GetFileResponse> {
        const file = await this.files.get(request.userId, request.fileId);
        return { file: await this.files.present(file, request.includeUrls) };
    }

    async batchGetFiles(request: filesV1.BatchGetFilesRequest): Promise<filesV1.BatchGetFilesResponse> {
        assertBatchSize(request.fileIds, 'file_ids');
        const files = await this.files.batchGet(request.userId, request.fileIds);
        return { files: await Promise.all(files.map((file) => this.files.present(file, request.includeUrls))) };
    }

    async listFiles(request: filesV1.ListFilesRequest): Promise<filesV1.ListFilesResponse> {
        assertBatchSize(request.fileIds, 'file_ids');
        const { files, nextPageToken } = await this.files.list(request.userId, {
            pageSize: request.pageSize,
            pageToken: request.pageToken,
            type: fromProtoEnum('FILE_TYPE', request.type) as FileType | undefined,
            uploadStatus: fromProtoEnum('UPLOAD_STATUS', request.uploadStatus) as UploadStatus | undefined,
            processingStatus: fromProtoEnum('PROCESSING_STATUS', request.processingStatus) as ProcessingStatus | undefined,
            processingStage: fromProtoEnum('PROCESSING_STAGE', request.processingStage) as ProcessingStage | undefined,
            collectionId: request.collectionId,
            fileIds: request.fileIds,
        });
        return {
            files: await Promise.all(files.map((file) => this.files.present(file, request.includeUrls))),
            nextPageToken,
        };
    }

    async renameFile(request: filesV1.RenameFileRequest): Promise<filesV1.RenameFileResponse> {
        return { file: await this.files.present(await this.files.rename(request.userId, request.fileId, request.name), true) };
    }

    async deleteFile(request: filesV1.DeleteFileRequest): Promise<filesV1.DeleteFileResponse> {
        await this.files.delete(request.userId, request.fileId);
        return {};
    }

    async reprocessFile(request: filesV1.ReprocessFileRequest): Promise<filesV1.ReprocessFileResponse> {
        return { file: await this.files.present(await this.files.reprocess(request.userId, request.fileId), true) };
    }

    createUpload(request: filesV1.CreateUploadRequest): Promise<filesV1.CreateUploadResponse> {
        return this.files.createUpload(request.userId, {
            fileName: request.fileName,
            sizeBytes: request.sizeBytes,
            mimeType: request.mimeType,
            requestId: request.requestId,
        });
    }

    async completeUpload(request: filesV1.CompleteUploadRequest): Promise<filesV1.CompleteUploadResponse> {
        const file = await this.files.completeUpload(request.userId, request.fileId, request.parts);
        return { file: await this.files.present(file, true) };
    }

    async abortUpload(request: filesV1.AbortUploadRequest): Promise<filesV1.AbortUploadResponse> {
        await this.files.abortUpload(request.userId, request.fileId);
        return {};
    }

    async importFile(request: filesV1.ImportFileRequest): Promise<filesV1.ImportFileResponse> {
        const file = await this.files.importFile(request.userId, request.url, request.requestId);
        return { file: await this.files.present(file, true) };
    }

    getStorageStats(request: filesV1.GetStorageStatsRequest): Promise<filesV1.GetStorageStatsResponse> {
        return this.files.storageStats(request.userId);
    }
}

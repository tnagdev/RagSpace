import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileType, Prisma, ProcessingStage, ProcessingStatus, UploadStatus } from '@prisma/client';
import {
    alreadyExists,
    clampPageSize,
    commonV1,
    decodePageToken,
    encodePageToken,
    eventsV1,
    failedPrecondition,
    filesV1,
    fromProtoEnum,
    invalidArgument,
    notFound,
    quotaExceeded,
    toProtoEnum,
} from '@ragspace/shared-ts';
import { randomUUID } from 'crypto';
import { BILLING_CLIENT } from '../clients/billing.client';
import type { BillingClient } from '../clients/billing.client';
import { eventBus } from '../events/event-bus';
import { PrismaService } from '../modules/prisma/prisma.service';
import { PRESIGN_EXPIRES_SECONDS, S3Service } from '../modules/s3/s3.service';
import { FILE_SELECT, FileRecord, fileTypeForMime, toProtoFile } from './file.mapper';
import { MediaProbeService } from './media-probe.service';
import { nextProcessingState } from './processing';
import { fetchYouTubeInfo, parseYouTubeId, YouTubeInfo } from './youtube';

const MIN_PART_BYTES = 10 * 1024 * 1024;
const MAX_PARTS = 10_000;
const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;
const STUCK_PROCESSING_MS = 30 * 60 * 1000;
const UPLOADABLE = new Set<FileType>([FileType.IMAGE, FileType.VIDEO, FileType.AUDIO]);
const PURGE_BATCH = 100;

export interface ListFilesQuery {
    pageSize: number;
    pageToken: string;
    type?: FileType;
    uploadStatus?: UploadStatus;
    processingStatus?: ProcessingStatus;
    processingStage?: ProcessingStage;
    collectionId?: string;
    fileIds: string[];
}

export interface CreateUploadInput {
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    requestId: string;
}

@Injectable()
export class FilesService {
    private readonly logger = new Logger(FilesService.name);
    private readonly maxFileSize: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
        private readonly media: MediaProbeService,
        @Inject(BILLING_CLIENT) private readonly billing: BillingClient,
        config: ConfigService,
    ) {
        this.maxFileSize = config.get<number>('upload.maxFileSize') as number;
    }

    async get(userId: string, fileId: string): Promise<FileRecord> {
        const file = await this.prisma.file.findFirst({ where: { id: fileId, userId }, select: FILE_SELECT });
        if (!file) throw notFound('File');
        return file;
    }

    batchGet(userId: string, fileIds: string[]): Promise<FileRecord[]> {
        if (fileIds.length === 0) return Promise.resolve([]);
        return this.prisma.file.findMany({ where: { userId, id: { in: fileIds } }, select: FILE_SELECT });
    }

    async present(file: FileRecord, includeUrls: boolean): Promise<filesV1.File> {
        if (!includeUrls) return toProtoFile(file);
        const downloadable = file.uploadStatus === UploadStatus.COMPLETED && file.fileType !== FileType.YOUTUBE_VIDEO;
        const [downloadUrl, thumbnailUrl] = await Promise.all([
            downloadable ? this.s3.getSignedUrl(file.s3Key) : undefined,
            file.thumbnailPath ? this.s3.getSignedUrl(file.thumbnailPath) : undefined,
        ]);
        return toProtoFile(file, { downloadUrl, thumbnailUrl });
    }

    async list(userId: string, query: ListFilesQuery): Promise<{ files: FileRecord[]; nextPageToken: string }> {
        const size = clampPageSize(query.pageSize);
        const cursor = decodePageToken<{ t: string; id: string }>(query.pageToken);
        const where: Prisma.FileWhereInput = {
            userId,
            ...(query.type ? { fileType: query.type } : {}),
            ...(query.uploadStatus ? { uploadStatus: query.uploadStatus } : {}),
            ...(query.processingStatus ? { processingStatus: query.processingStatus } : {}),
            ...(query.processingStage ? { processingStage: query.processingStage } : {}),
            ...(query.fileIds.length > 0 ? { id: { in: query.fileIds } } : {}),
            ...(query.collectionId ? { fileCollections: { some: { collectionId: query.collectionId } } } : {}),
            ...(cursor
                ? {
                    OR: [
                        { createdAt: { lt: new Date(cursor.t) } },
                        { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
                    ],
                }
                : {}),
        };
        const rows = await this.prisma.file.findMany({
            where,
            select: FILE_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: size + 1,
        });
        const files = rows.slice(0, size);
        const last = files[files.length - 1];
        return {
            files,
            nextPageToken: rows.length > size && last ? encodePageToken({ t: last.createdAt.toISOString(), id: last.id }) : '',
        };
    }

    async rename(userId: string, fileId: string, name: string): Promise<FileRecord> {
        const trimmed = name.trim();
        if (!trimmed) throw invalidArgument('name must not be empty');
        await this.get(userId, fileId);
        const file = await this.prisma.file.update({ where: { id: fileId }, data: { filename: trimmed }, select: FILE_SELECT });
        await this.publishUpdated(file);
        return file;
    }

    async delete(userId: string, fileId: string): Promise<void> {
        const file = await this.get(userId, fileId);
        await this.removeStoredObjects(file);
        await this.prisma.file.delete({ where: { id: fileId } });
        await this.releaseStorage(file);
        await eventBus.publish({
            $case: 'fileDeleted',
            fileDeleted: { fileId, userId, type: toProtoEnum<commonV1.FileType>('FILE_TYPE', file.fileType) },
        });
    }

    async reprocess(userId: string, fileId: string): Promise<FileRecord> {
        const file = await this.get(userId, fileId);
        if (file.uploadStatus !== UploadStatus.COMPLETED) throw failedPrecondition('File has not finished uploading');
        const stuck = Date.now() - file.updatedAt.getTime() > STUCK_PROCESSING_MS;
        if (file.processingStatus === ProcessingStatus.IN_PROGRESS && !stuck) {
            throw failedPrecondition('File is already being processed');
        }
        const updated = await this.prisma.file.update({
            where: { id: fileId },
            data: {
                processingStatus: ProcessingStatus.IN_PROGRESS,
                processingStage: ProcessingStage.EMBEDDING,
                processingRetryCount: 0,
                errorMessage: null,
                processingStartedAt: new Date(),
                processingCompletedAt: null,
            },
            select: FILE_SELECT,
        });
        await this.publishUploaded(updated, true);
        await this.publishUpdated(updated);
        return updated;
    }

    async createUpload(userId: string, input: CreateUploadInput): Promise<filesV1.CreateUploadResponse> {
        const fileName = input.fileName.trim();
        if (!fileName) throw invalidArgument('fileName is required');
        if (input.sizeBytes <= 0) throw invalidArgument('sizeBytes must be positive');
        if (input.sizeBytes > this.maxFileSize) {
            throw invalidArgument(`File exceeds the ${formatBytes(this.maxFileSize)} upload limit`);
        }
        const fileType = fileTypeForMime(input.mimeType);
        if (!UPLOADABLE.has(fileType)) throw invalidArgument('Only image, video and audio files are supported');

        if (input.requestId) {
            const existing = await this.findByRequestId(userId, input.requestId);
            if (existing) return this.resumeUpload(existing);
        }

        const id = randomUUID();
        await this.consumeStorage(userId, id, input.sizeBytes);
        try {
            const key = this.s3.objectKey(userId, fileName);
            const multipartUploadId = await this.s3.createMultipartUpload(key, input.mimeType, { userId, fileId: id });
            const file = await this.prisma.file.create({
                data: {
                    id,
                    userId,
                    filename: fileName,
                    originalFilename: fileName,
                    fileSize: BigInt(input.sizeBytes),
                    mimeType: input.mimeType,
                    fileType,
                    s3Key: key,
                    s3Bucket: this.s3.bucket,
                    multipartUploadId,
                    clientRequestId: input.requestId || null,
                    uploadStatus: UploadStatus.UPLOADING,
                    processingStatus: ProcessingStatus.NOT_STARTED,
                    processingStage: ProcessingStage.UPLOAD,
                },
                select: FILE_SELECT,
            });
            return this.uploadSession(file);
        } catch (error) {
            await this.releaseStorage({ id, userId, fileSize: BigInt(input.sizeBytes), fileType });
            if (input.requestId && isUniqueViolation(error)) {
                const winner = await this.findByRequestId(userId, input.requestId);
                if (winner) return this.resumeUpload(winner);
            }
            throw error;
        }
    }

    async completeUpload(userId: string, fileId: string, parts: filesV1.CompletedPart[]): Promise<FileRecord> {
        const file = await this.get(userId, fileId);
        if (file.uploadStatus === UploadStatus.COMPLETED) return file;
        if (file.uploadStatus !== UploadStatus.UPLOADING || !file.multipartUploadId) {
            throw failedPrecondition('Upload is not in progress');
        }
        if (parts.length === 0) throw invalidArgument('parts is required');

        try {
            await this.s3.completeMultipartUpload(
                file.s3Key,
                file.multipartUploadId,
                parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
            );
        } catch (error) {
            throw invalidArgument(`The uploaded parts could not be assembled: ${(error as Error).message}`);
        }

        const attributes = await this.media.inspect(file);
        try {
            await this.media.assertDurationAllowed(userId, file.fileType, attributes.durationSeconds);
        } catch (error) {
            await this.s3.deleteObject(file.s3Key);
            await this.prisma.file.delete({ where: { id: fileId } });
            await this.releaseStorage(file);
            throw error;
        }

        const now = new Date();
        const updated = await this.prisma.file.update({
            where: { id: fileId },
            data: {
                uploadStatus: UploadStatus.COMPLETED,
                uploadedAt: now,
                multipartUploadId: null,
                processingStatus: ProcessingStatus.IN_PROGRESS,
                processingStage: ProcessingStage.EMBEDDING,
                processingStartedAt: now,
                metadata: { ...objectOrEmpty(file.metadata), ...attributes } as Prisma.InputJsonObject,
            },
            select: FILE_SELECT,
        });
        await this.publishUploaded(updated, false);
        await this.publishUpdated(updated);
        return updated;
    }

    async abortUpload(userId: string, fileId: string): Promise<void> {
        const file = await this.get(userId, fileId);
        if (file.uploadStatus !== UploadStatus.UPLOADING) throw failedPrecondition('Upload is not in progress');
        if (file.multipartUploadId) await this.s3.abortMultipartUpload(file.s3Key, file.multipartUploadId);
        await this.prisma.file.delete({ where: { id: fileId } });
        await this.releaseStorage(file);
    }

    async importFile(userId: string, url: string, requestId: string): Promise<FileRecord> {
        const videoId = parseYouTubeId(url);
        if (!videoId) throw invalidArgument('Only YouTube video URLs are supported');

        if (requestId) {
            const existing = await this.findByRequestId(userId, requestId);
            if (existing) return existing;
        }

        let info: YouTubeInfo = {};
        try {
            info = await fetchYouTubeInfo(url);
        } catch (error) {
            this.logger.warn(`YouTube metadata unavailable for ${videoId}: ${(error as Error).message}`);
        }
        await this.media.assertDurationAllowed(userId, FileType.YOUTUBE_VIDEO, info.durationSeconds);

        const id = randomUUID();
        const quota = await this.billing.consumeQuota({
            userId,
            metric: commonV1.UsageMetric.USAGE_METRIC_YOUTUBE_VIDEOS,
            amount: 1,
            requestId: `import:${id}`,
        });
        if (!quota.allowed) {
            throw quotaExceeded('YOUTUBE_VIDEOS', quota.used, quota.limit, 'YouTube import limit reached for your plan');
        }

        const title = info.title?.trim() || `YouTube video ${videoId}`;
        const now = new Date();
        const file = await this.prisma.file.create({
            data: {
                id,
                userId,
                filename: title,
                originalFilename: title,
                fileSize: BigInt(0),
                mimeType: 'video/mp4',
                fileType: FileType.YOUTUBE_VIDEO,
                s3Key: `uploads/${userId}/youtube/${videoId}_${now.getTime()}.mp4`,
                s3Bucket: this.s3.bucket,
                youtubeUrl: url,
                clientRequestId: requestId || null,
                metadata: { videoId, ...info } as Prisma.InputJsonObject,
                uploadStatus: UploadStatus.COMPLETED,
                uploadedAt: now,
                processingStatus: ProcessingStatus.IN_PROGRESS,
                processingStage: ProcessingStage.EMBEDDING,
                processingStartedAt: now,
            },
            select: FILE_SELECT,
        });
        await this.publishUploaded(file, false);
        await this.publishUpdated(file);
        return file;
    }

    async storageStats(userId: string): Promise<filesV1.GetStorageStatsResponse> {
        const result = await this.prisma.file.aggregate({
            where: { userId, uploadStatus: UploadStatus.COMPLETED },
            _sum: { fileSize: true },
            _count: true,
        });
        return { usedBytes: Number(result._sum.fileSize ?? 0), fileCount: result._count };
    }

    async applyStageChange(change: eventsV1.FileStageChanged): Promise<void> {
        const file = await this.prisma.file.findFirst({
            where: { id: change.fileId, userId: change.userId },
            select: FILE_SELECT,
        });
        if (!file) {
            this.logger.warn(`Stage change for unknown file ${change.fileId}`);
            return;
        }
        const stage = fromProtoEnum('PROCESSING_STAGE', change.stage) as ProcessingStage | undefined;
        const status = fromProtoEnum('PROCESSING_STATUS', change.status) as ProcessingStatus | undefined;
        const update = stage && status
            ? nextProcessingState(file, { stage, status, errorMessage: change.errorMessage, retryCount: change.retryCount }, new Date())
            : null;
        const enrichment = enrichmentFrom(file, change);

        if (!update && !enrichment) {
            if (change.progressPercent !== undefined && stage === file.processingStage) {
                await this.publishUpdated(file, change.progressPercent);
            }
            return;
        }

        const updated = await this.prisma.file.update({
            where: { id: file.id },
            data: { ...update, ...enrichment },
            select: FILE_SELECT,
        });
        await this.publishUpdated(updated, change.progressPercent);
    }

    async purgeUser(userId: string): Promise<number> {
        let removed = 0;
        for (; ;) {
            const batch = await this.prisma.file.findMany({
                where: { userId },
                select: FILE_SELECT,
                take: PURGE_BATCH,
            });
            if (batch.length === 0) break;
            for (const file of batch) await this.removeStoredObjects(file);
            const { count } = await this.prisma.file.deleteMany({ where: { id: { in: batch.map((f) => f.id) } } });
            removed += count;
        }
        await this.prisma.collection.deleteMany({ where: { userId } });
        return removed;
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async failStaleUploads(): Promise<void> {
        const stale = await this.prisma.file.findMany({
            where: { uploadStatus: UploadStatus.UPLOADING, createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_MS) } },
            select: FILE_SELECT,
            take: PURGE_BATCH,
        });
        for (const file of stale) {
            if (file.multipartUploadId) await this.s3.abortMultipartUpload(file.s3Key, file.multipartUploadId);
            const updated = await this.prisma.file.update({
                where: { id: file.id },
                data: { uploadStatus: UploadStatus.FAILED, multipartUploadId: null, errorMessage: 'Upload did not complete' },
                select: FILE_SELECT,
            });
            await this.releaseStorage(file);
            await this.publishUpdated(updated);
        }
        if (stale.length > 0) this.logger.warn(`Marked ${stale.length} stale upload(s) as failed`);
    }

    private findByRequestId(userId: string, clientRequestId: string): Promise<FileRecord | null> {
        return this.prisma.file.findUnique({
            where: { userId_clientRequestId: { userId, clientRequestId } },
            select: FILE_SELECT,
        });
    }

    private async resumeUpload(file: FileRecord): Promise<filesV1.CreateUploadResponse> {
        if (file.uploadStatus !== UploadStatus.UPLOADING || !file.multipartUploadId) {
            throw alreadyExists('An upload with this Idempotency-Key already finished');
        }
        return this.uploadSession(file);
    }

    private async uploadSession(file: FileRecord): Promise<filesV1.CreateUploadResponse> {
        const size = Number(file.fileSize);
        const partSizeBytes = Math.max(MIN_PART_BYTES, Math.ceil(size / MAX_PARTS));
        const partCount = Math.max(1, Math.ceil(size / partSizeBytes));
        const urls = await this.s3.presignParts(file.s3Key, file.multipartUploadId!, partCount);
        return {
            file: toProtoFile(file),
            partSizeBytes,
            parts: urls.map((url, index) => ({ partNumber: index + 1, url })),
            urlExpireTime: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000),
        };
    }

    private async consumeStorage(userId: string, fileId: string, sizeBytes: number): Promise<void> {
        const result = await this.billing.consumeQuota({
            userId,
            metric: commonV1.UsageMetric.USAGE_METRIC_STORAGE,
            amount: sizeBytes,
            requestId: `upload:${fileId}`,
        });
        if (!result.allowed) {
            const remaining = result.limit > 0 ? Math.max(0, result.limit - result.used) : 0;
            throw quotaExceeded(
                'STORAGE',
                result.used,
                result.limit,
                `This file needs ${formatBytes(sizeBytes)}; ${formatBytes(remaining)} of storage is left on your plan`,
            );
        }
    }

    private async releaseStorage(file: Pick<FileRecord, 'id' | 'userId' | 'fileSize' | 'fileType'>): Promise<void> {
        const amount = Number(file.fileSize);
        if (file.fileType === FileType.YOUTUBE_VIDEO || amount <= 0) return;
        try {
            await this.billing.releaseQuota({
                userId: file.userId,
                metric: commonV1.UsageMetric.USAGE_METRIC_STORAGE,
                amount,
                requestId: `release:${file.id}`,
            });
        } catch (error) {
            this.logger.error(`Storage release failed for ${file.id}`, error);
        }
    }

    private async removeStoredObjects(file: FileRecord): Promise<void> {
        if (file.uploadStatus === UploadStatus.UPLOADING && file.multipartUploadId) {
            await this.s3.abortMultipartUpload(file.s3Key, file.multipartUploadId);
        } else if (file.s3Key) {
            await this.s3.deleteObject(file.s3Key);
        }
        if (file.thumbnailPath) await this.s3.deleteObject(file.thumbnailPath);
    }

    private publishUploaded(file: FileRecord, reprocess: boolean): Promise<unknown> {
        return eventBus.publish({
            $case: 'fileUploaded',
            fileUploaded: {
                fileId: file.id,
                userId: file.userId,
                name: file.filename,
                type: toProtoEnum<commonV1.FileType>('FILE_TYPE', file.fileType),
                mimeType: file.mimeType,
                sizeBytes: Number(file.fileSize),
                bucket: file.s3Bucket,
                key: file.s3Key,
                youtubeUrl: file.youtubeUrl ?? undefined,
                reprocess,
            },
        });
    }

    private publishUpdated(file: FileRecord, progressPercent?: number): Promise<unknown> {
        return eventBus.publish({
            $case: 'fileUpdated',
            fileUpdated: {
                fileId: file.id,
                userId: file.userId,
                name: file.filename,
                uploadStatus: toProtoEnum<commonV1.UploadStatus>('UPLOAD_STATUS', file.uploadStatus),
                processingStatus: toProtoEnum<commonV1.ProcessingStatus>('PROCESSING_STATUS', file.processingStatus),
                processingStage: toProtoEnum<commonV1.ProcessingStage>('PROCESSING_STAGE', file.processingStage),
                errorMessage: file.errorMessage ?? undefined,
                updateTime: file.updatedAt,
                progressPercent,
            },
        });
    }
}

function enrichmentFrom(file: FileRecord, change: eventsV1.FileStageChanged): Prisma.FileUncheckedUpdateInput | null {
    const data: Prisma.FileUncheckedUpdateInput = {};
    if (change.thumbnailKey) data.thumbnailPath = change.thumbnailKey;
    if (change.name) {
        data.originalFilename = change.name;
        if (file.filename === file.originalFilename) data.filename = change.name;
    }
    if (change.sizeBytes && change.sizeBytes > 0) data.fileSize = BigInt(change.sizeBytes);
    if (change.attributes && Object.keys(change.attributes).length > 0) {
        data.metadata = { ...objectOrEmpty(file.metadata), ...change.attributes } as Prisma.InputJsonObject;
    }
    return Object.keys(data).length > 0 ? data : null;
}

function objectOrEmpty(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.ceil(bytes / 1024)} KB`;
}

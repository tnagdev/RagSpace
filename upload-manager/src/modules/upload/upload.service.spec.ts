// uuid@11 ships pure ESM; mock it so Jest's CommonJS runner can load s3.service.ts
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid-v4') }));

// submitYouTubeLink shells out to yt-dlp; make exec fail fast so tests don't hit the
// real binary (or the 15s timeout) and the service falls through to its fallback path.
jest.mock('child_process', () => ({
    exec: jest.fn((cmd: string, opts: unknown, cb: (err: Error) => void) => {
        const callback = typeof opts === 'function' ? opts : cb;
        (callback as (err: Error) => void)(new Error('yt-dlp: command not found'));
    }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { RabbitmqService, FileEventType } from '../rabbitmq/rabbitmq.service';
import { PaymentClientService } from '../../common/payment/payment-client.service';
import { UploadStatus, ProcessingStatus, ProcessingStage, FileType } from '@prisma/client';

const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
};

const mockSession = {
    id: 'session-1',
    token: 'token',
    userId: 'user-1',
    expiresAt: '2099-01-01',
};

describe('UploadService', () => {
    let service: UploadService;
    let prisma: jest.Mocked<{ file: Record<string, jest.Mock> }>;
    let s3Service: jest.Mocked<S3Service>;
    let rabbitmqService: jest.Mocked<RabbitmqService>;
    let paymentClient: jest.Mocked<PaymentClientService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UploadService,
                {
                    provide: PrismaService,
                    useValue: {
                        file: {
                            create: jest.fn(),
                            update: jest.fn(),
                            updateMany: jest.fn(),
                            findFirst: jest.fn(),
                            findMany: jest.fn(),
                            findUnique: jest.fn(),
                            delete: jest.fn(),
                            deleteMany: jest.fn(),
                            count: jest.fn(),
                            aggregate: jest.fn(),
                        },
                    },
                },
                {
                    provide: S3Service,
                    useValue: {
                        uploadFile: jest.fn(),
                        getSignedUrl: jest.fn(),
                        deleteFile: jest.fn(),
                        initMultipartUpload: jest.fn(),
                        completeMultipartUpload: jest.fn(),
                        abortMultipartUpload: jest.fn(),
                    },
                },
                {
                    provide: RabbitmqService,
                    useValue: {
                        publishEvent: jest.fn(),
                    },
                },
                {
                    provide: PaymentClientService,
                    useValue: {
                        checkUsage: jest.fn().mockResolvedValue({ allowed: true, limit: 'unlimited' }),
                    },
                },
            ],
        }).compile();

        service = module.get<UploadService>(UploadService);
        prisma = module.get(PrismaService) as any;
        s3Service = module.get(S3Service) as any;
        rabbitmqService = module.get(RabbitmqService) as any;
        paymentClient = module.get(PaymentClientService) as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ---------------------------------------------------------------------------
    // onApplicationBootstrap
    // ---------------------------------------------------------------------------

    describe('onApplicationBootstrap', () => {
        it('marks stale UPLOADING files as FAILED using a 5-minute cutoff', async () => {
            prisma.file.updateMany.mockResolvedValue({ count: 3 });
            await service.onApplicationBootstrap();
            expect(prisma.file.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ uploadStatus: UploadStatus.UPLOADING }),
                    data: { uploadStatus: UploadStatus.FAILED },
                }),
            );
        });

        it('does not log a warning when no stale files are found', async () => {
            prisma.file.updateMany.mockResolvedValue({ count: 0 });
            const warnSpy = jest.spyOn((service as any).logger, 'warn');
            await service.onApplicationBootstrap();
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------------------
    // uploadFile
    // ---------------------------------------------------------------------------

    describe('uploadFile', () => {
        const mockFile = {
            originalname: 'test.mp4',
            mimetype: 'video/mp4',
            size: 1024 * 1024,
            buffer: Buffer.from('test'),
        } as Express.Multer.File;

        const fileRecord = {
            id: 'file-1',
            userId: 'user-1',
            filename: 'test.mp4',
            originalFilename: 'test.mp4',
            fileSize: 1024 * 1024,
            mimeType: 'video/mp4',
            fileType: FileType.VIDEO,
            s3Key: '',
            s3Bucket: '',
            uploadStatus: UploadStatus.UPLOADING,
            processingStatus: ProcessingStatus.NOT_STARTED,
            processingStage: ProcessingStage.UPLOAD,
        };

        const uploadResult = {
            key: 'uploads/user-1/2024/1/uuid.mp4',
            bucket: 'ragspace-uploads',
            url: 'https://s3.example.com/test',
            size: 1024 * 1024,
        };

        const updatedFile = {
            ...fileRecord,
            s3Key: uploadResult.key,
            s3Bucket: uploadResult.bucket,
            s3Url: uploadResult.url,
            uploadStatus: UploadStatus.COMPLETED,
            processingStatus: ProcessingStatus.IN_PROGRESS,
            processingStage: ProcessingStage.EMBEDDING,
        };

        beforeEach(() => {
            prisma.file.create.mockResolvedValue(fileRecord as any);
            s3Service.uploadFile.mockResolvedValue(uploadResult as any);
            prisma.file.update.mockResolvedValue(updatedFile as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
        });

        it('creates DB record, uploads to S3, and returns the updated file', async () => {
            const result = await service.uploadFile(mockFile, mockUser as any);
            expect(prisma.file.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', filename: 'test.mp4' }) }),
            );
            expect(s3Service.uploadFile).toHaveBeenCalledWith(mockFile, 'user-1', expect.any(Function));
            expect(result).toEqual(updatedFile);
        });

        it('publishes UPLOAD_STARTED then UPLOAD_COMPLETED events in that order', async () => {
            await service.uploadFile(mockFile, mockUser as any);
            expect(rabbitmqService.publishEvent).toHaveBeenCalledTimes(2);
            expect(rabbitmqService.publishEvent).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ type: FileEventType.UPLOAD_STARTED }),
            );
            expect(rabbitmqService.publishEvent).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ type: FileEventType.UPLOAD_COMPLETED }),
            );
        });

        it('sets UPLOADING / NOT_STARTED / UPLOAD stage on the initial DB record', async () => {
            await service.uploadFile(mockFile, mockUser as any);
            expect(prisma.file.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    uploadStatus: UploadStatus.UPLOADING,
                    processingStatus: ProcessingStatus.NOT_STARTED,
                    processingStage: ProcessingStage.UPLOAD,
                }),
            });
        });

        it('updates file to COMPLETED / IN_PROGRESS / EMBEDDING after a successful S3 upload', async () => {
            await service.uploadFile(mockFile, mockUser as any);
            expect(prisma.file.update).toHaveBeenCalledWith({
                where: { id: 'file-1' },
                data: expect.objectContaining({
                    uploadStatus: UploadStatus.COMPLETED,
                    processingStatus: ProcessingStatus.IN_PROGRESS,
                    processingStage: ProcessingStage.EMBEDDING,
                }),
            });
        });

        it('when S3 upload fails: publishes UPLOAD_FAILED, deletes DB record, and rethrows', async () => {
            s3Service.uploadFile.mockRejectedValue(new Error('S3 connection failed'));

            await expect(service.uploadFile(mockFile, mockUser as any)).rejects.toThrow('S3 connection failed');

            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: FileEventType.UPLOAD_FAILED }),
            );
            expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
        });

        describe('MIME type → FileType mapping', () => {
            const cases: Array<[string, string, FileType]> = [
                ['image/jpeg', 'photo.jpg', FileType.IMAGE],
                ['image/png', 'photo.png', FileType.IMAGE],
                ['video/mp4', 'clip.mp4', FileType.VIDEO],
                ['video/webm', 'clip.webm', FileType.VIDEO],
                ['audio/mpeg', 'track.mp3', FileType.AUDIO],
                ['audio/wav', 'track.wav', FileType.AUDIO],
                ['application/pdf', 'doc.pdf', FileType.DOCUMENT],
                ['text/plain', 'note.txt', FileType.DOCUMENT],
                ['application/octet-stream', 'data.bin', FileType.OTHER],
            ];

            it.each(cases)('%s → %s', async (mimetype, originalname, expectedType) => {
                const file = { originalname, mimetype, size: 100, buffer: Buffer.from('') } as Express.Multer.File;
                await service.uploadFile(file, mockUser as any);
                expect(prisma.file.create).toHaveBeenCalledWith(
                    expect.objectContaining({ data: expect.objectContaining({ fileType: expectedType }) }),
                );
            });
        });
    });

    // ---------------------------------------------------------------------------
    // getFileById
    // ---------------------------------------------------------------------------

    describe('getFileById', () => {
        const baseFile = {
            id: 'file-1',
            userId: 'user-1',
            filename: 'test.mp4',
            fileType: FileType.VIDEO,
            s3Key: 'uploads/user-1/test.mp4',
            uploadStatus: UploadStatus.COMPLETED,
            thumbnailPath: null,
        };

        it('returns file with signed URL for a COMPLETED non-YouTube file', async () => {
            prisma.file.findFirst.mockResolvedValue(baseFile as any);
            s3Service.getSignedUrl.mockResolvedValue('https://signed.com/file');

            const result = await service.getFileById('file-1', 'user-1');

            expect(s3Service.getSignedUrl).toHaveBeenCalledWith(baseFile.s3Key);
            expect(result).toMatchObject({ s3Url: 'https://signed.com/file' });
        });

        it('includes a thumbnail URL when thumbnailPath is set', async () => {
            prisma.file.findFirst.mockResolvedValue({ ...baseFile, thumbnailPath: 'thumbnails/thumb.jpg' } as any);
            s3Service.getSignedUrl
                .mockResolvedValueOnce('https://signed.com/file')
                .mockResolvedValueOnce('https://signed.com/thumb');

            const result = await service.getFileById('file-1', 'user-1');

            expect(result).toMatchObject({
                s3Url: 'https://signed.com/file',
                thumbnailUrl: 'https://signed.com/thumb',
            });
        });

        it('throws NotFoundException when the file is not found', async () => {
            prisma.file.findFirst.mockResolvedValue(null);
            await expect(service.getFileById('missing', 'user-1')).rejects.toThrow(NotFoundException);
        });

        it('returns YouTube file with null s3Url but with thumbnail URL', async () => {
            const ytFile = { ...baseFile, fileType: FileType.YOUTUBE_VIDEO, thumbnailPath: 'thumbnails/thumb.jpg' };
            prisma.file.findFirst.mockResolvedValue(ytFile as any);
            s3Service.getSignedUrl.mockResolvedValue('https://signed.com/thumb');

            const result = await service.getFileById('file-1', 'user-1') as any;

            expect(result.s3Url).toBeNull();
            expect(s3Service.getSignedUrl).toHaveBeenCalledWith('thumbnails/thumb.jpg');
        });

        it('returns file as-is without generating a signed URL when upload is not COMPLETED', async () => {
            const pendingFile = { ...baseFile, uploadStatus: UploadStatus.UPLOADING };
            prisma.file.findFirst.mockResolvedValue(pendingFile as any);

            const result = await service.getFileById('file-1', 'user-1');

            expect(s3Service.getSignedUrl).not.toHaveBeenCalled();
            expect(result).toEqual(pendingFile);
        });
    });

    // ---------------------------------------------------------------------------
    // getFiles
    // ---------------------------------------------------------------------------

    describe('getFiles', () => {
        beforeEach(() => {
            prisma.file.findMany.mockResolvedValue([]);
            prisma.file.count.mockResolvedValue(0);
        });

        it('returns paginated result with total count', async () => {
            const files = [{ id: 'file-1', uploadStatus: UploadStatus.UPLOADING, s3Key: null, thumbnailPath: null }];
            prisma.file.findMany.mockResolvedValue(files as any);
            prisma.file.count.mockResolvedValue(1);

            const result = await service.getFiles('user-1', { page: 1, limit: 20 } as any);

            expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
            expect(result.files).toHaveLength(1);
        });

        it('applies correct skip of 0 for page 1 with limit 20', async () => {
            await service.getFiles('user-1', { page: 1, limit: 20 } as any);
            expect(prisma.file.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 0, take: 20 }),
            );
        });

        it('calculates correct skip for page 2 with limit 10', async () => {
            await service.getFiles('user-1', { page: 2, limit: 10 } as any);
            expect(prisma.file.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 10, take: 10 }),
            );
        });

        it('filters by uploadStatus when provided', async () => {
            await service.getFiles('user-1', { uploadStatus: UploadStatus.COMPLETED } as any);
            expect(prisma.file.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ uploadStatus: UploadStatus.COMPLETED }),
                }),
            );
        });

        it('generates signed URLs for COMPLETED files and skips signing for others', async () => {
            const files = [
                { id: 'f1', uploadStatus: UploadStatus.COMPLETED, s3Key: 'key1', fileType: FileType.VIDEO, thumbnailPath: null },
                { id: 'f2', uploadStatus: UploadStatus.UPLOADING, s3Key: null, fileType: FileType.VIDEO, thumbnailPath: null },
            ];
            prisma.file.findMany.mockResolvedValue(files as any);
            prisma.file.count.mockResolvedValue(2);
            s3Service.getSignedUrl.mockResolvedValue('https://signed.com/f1');

            await service.getFiles('user-1', { page: 1, limit: 20 } as any);

            expect(s3Service.getSignedUrl).toHaveBeenCalledTimes(1);
            expect(s3Service.getSignedUrl).toHaveBeenCalledWith('key1');
        });
    });

    // ---------------------------------------------------------------------------
    // getStorageStats
    // ---------------------------------------------------------------------------

    describe('getStorageStats', () => {
        it('returns correct usedBytes, totalBytes, and fileCount', async () => {
            prisma.file.aggregate.mockResolvedValue({ _sum: { fileSize: 2_147_483_648 }, _count: 5 } as any);

            const result = await service.getStorageStats('user-1');

            expect(result).toMatchObject({
                usedBytes: 2_147_483_648,
                totalBytes: 100 * 1024 * 1024 * 1024,
                fileCount: 5,
            });
        });

        it('returns 0 usedBytes and fileCount 0 when there are no completed files', async () => {
            prisma.file.aggregate.mockResolvedValue({ _sum: { fileSize: null }, _count: 0 } as any);

            const result = await service.getStorageStats('user-1');

            expect(result.usedBytes).toBe(0);
            expect(result.fileCount).toBe(0);
        });
    });

    // ---------------------------------------------------------------------------
    // deleteFile
    // ---------------------------------------------------------------------------

    describe('deleteFile', () => {
        const completedFile = {
            id: 'file-1',
            userId: 'user-1',
            filename: 'test.mp4',
            fileType: FileType.VIDEO,
            s3Key: 'uploads/user-1/test.mp4',
            uploadStatus: UploadStatus.COMPLETED,
            thumbnailPath: null,
        };

        beforeEach(() => {
            prisma.file.findFirst.mockResolvedValue(completedFile as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
            s3Service.getSignedUrl.mockResolvedValue('https://signed.com/file');
            s3Service.deleteFile.mockResolvedValue(undefined);
            prisma.file.delete.mockResolvedValue(completedFile as any);
        });

        it('publishes FILE_DELETED, deletes S3 file, deletes DB record, and returns success', async () => {
            const result = await service.deleteFile('file-1', mockUser as any);

            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: FileEventType.FILE_DELETED }),
            );
            expect(s3Service.deleteFile).toHaveBeenCalledWith('uploads/user-1/test.mp4');
            expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
            expect(result).toEqual({ message: 'File deleted successfully' });
        });

        it('continues with S3 and DB deletion even if event publishing fails', async () => {
            rabbitmqService.publishEvent.mockRejectedValue(new Error('RabbitMQ down'));

            const result = await service.deleteFile('file-1', mockUser as any);

            expect(s3Service.deleteFile).toHaveBeenCalled();
            expect(prisma.file.delete).toHaveBeenCalled();
            expect(result).toEqual({ message: 'File deleted successfully' });
        });

        it('skips S3 deletion for non-COMPLETED uploads', async () => {
            prisma.file.findFirst.mockResolvedValue({ ...completedFile, uploadStatus: UploadStatus.UPLOADING } as any);

            await service.deleteFile('file-1', mockUser as any);

            expect(s3Service.deleteFile).not.toHaveBeenCalled();
            expect(prisma.file.delete).toHaveBeenCalled();
        });

        it('also deletes thumbnail from S3 when thumbnailPath is set', async () => {
            prisma.file.findFirst.mockResolvedValue({ ...completedFile, thumbnailPath: 'thumbnails/thumb.jpg' } as any);
            s3Service.getSignedUrl
                .mockResolvedValueOnce('https://signed.com/file')
                .mockResolvedValueOnce('https://signed.com/thumb');

            await service.deleteFile('file-1', mockUser as any);

            expect(s3Service.deleteFile).toHaveBeenCalledWith('thumbnails/thumb.jpg');
        });
    });

    // ---------------------------------------------------------------------------
    // deleteFiles
    // ---------------------------------------------------------------------------

    describe('deleteFiles', () => {
        const files = [
            { id: 'f1', s3Key: 'uploads/f1.mp4', uploadStatus: UploadStatus.COMPLETED, fileType: FileType.VIDEO, filename: 'f1.mp4', thumbnailPath: null },
            { id: 'f2', s3Key: 'uploads/f2.mp4', uploadStatus: UploadStatus.COMPLETED, fileType: FileType.VIDEO, filename: 'f2.mp4', thumbnailPath: null },
        ];

        beforeEach(() => {
            prisma.file.findMany.mockResolvedValue(files as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
            s3Service.deleteFile.mockResolvedValue(undefined);
            prisma.file.deleteMany.mockResolvedValue({ count: 2 });
        });

        it('returns not-found message when no matching files exist', async () => {
            prisma.file.findMany.mockResolvedValue([]);

            const result = await service.deleteFiles(['file-1'], mockUser as any);

            expect(result).toEqual({ message: 'No files found', deletedCount: 0 });
            expect(prisma.file.deleteMany).not.toHaveBeenCalled();
        });

        it('publishes a batch FILE_DELETED event and deletes all S3 files', async () => {
            await service.deleteFiles(['f1', 'f2'], mockUser as any);

            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: FileEventType.FILE_DELETED }),
            );
            expect(s3Service.deleteFile).toHaveBeenCalledTimes(2);
            expect(prisma.file.deleteMany).toHaveBeenCalled();
        });

        it('returns the correct delete count', async () => {
            const result = await service.deleteFiles(['f1', 'f2'], mockUser as any);
            expect(result).toEqual({ message: '2 files deleted successfully', deletedCount: 2 });
        });
    });

    // ---------------------------------------------------------------------------
    // deleteAllUserFiles
    // ---------------------------------------------------------------------------

    describe('deleteAllUserFiles', () => {
        it('returns deletedCount 0 and empty fileIds when no files exist', async () => {
            prisma.file.findMany.mockResolvedValue([]);

            const result = await service.deleteAllUserFiles('user-1');

            expect(result).toEqual({ deletedCount: 0, fileIds: [] });
            expect(prisma.file.deleteMany).not.toHaveBeenCalled();
        });

        it('deletes S3 objects and then all DB records', async () => {
            const dbFiles = [
                { id: 'f1', s3Key: 'uploads/f1.mp4', uploadStatus: UploadStatus.COMPLETED, thumbnailPath: null },
            ];
            prisma.file.findMany.mockResolvedValue(dbFiles as any);
            s3Service.deleteFile.mockResolvedValue(undefined);
            prisma.file.deleteMany.mockResolvedValue({ count: 1 });

            const result = await service.deleteAllUserFiles('user-1');

            expect(s3Service.deleteFile).toHaveBeenCalledWith('uploads/f1.mp4');
            expect(prisma.file.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
            expect(result).toEqual({ deletedCount: 1, fileIds: ['f1'] });
        });

        it('skips S3 deletion for files that are not COMPLETED', async () => {
            prisma.file.findMany.mockResolvedValue([
                { id: 'f1', s3Key: 'uploads/f1.mp4', uploadStatus: UploadStatus.UPLOADING, thumbnailPath: null },
            ] as any);
            prisma.file.deleteMany.mockResolvedValue({ count: 1 });

            await service.deleteAllUserFiles('user-1');

            expect(s3Service.deleteFile).not.toHaveBeenCalled();
        });

        it('continues with DB deletion even if an S3 delete throws', async () => {
            prisma.file.findMany.mockResolvedValue([
                { id: 'f1', s3Key: 'uploads/f1.mp4', uploadStatus: UploadStatus.COMPLETED, thumbnailPath: null },
            ] as any);
            s3Service.deleteFile.mockRejectedValue(new Error('S3 unreachable'));
            prisma.file.deleteMany.mockResolvedValue({ count: 1 });

            await expect(service.deleteAllUserFiles('user-1')).resolves.toEqual({
                deletedCount: 1,
                fileIds: ['f1'],
            });
            expect(prisma.file.deleteMany).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------------------
    // initMultipartUpload
    // ---------------------------------------------------------------------------

    describe('initMultipartUpload', () => {
        const uploadInit = {
            uploadId: 'upload-abc',
            key: 'uploads/user-1/file.mp4',
            bucket: 'ragspace-uploads',
            presignedUrls: ['https://presign-1.com', 'https://presign-2.com'],
        };

        beforeEach(() => {
            s3Service.initMultipartUpload.mockResolvedValue(uploadInit as any);
            prisma.file.create.mockResolvedValue({ id: 'file-1', ...uploadInit } as any);
        });

        it('returns fileId, uploadId, key, presignedUrls, and chunkSize', async () => {
            const result = await service.initMultipartUpload('video.mp4', 100 * 1024 * 1024, 'video/mp4', 5 * 1024 * 1024, mockUser as any);

            expect(result).toMatchObject({
                fileId: 'file-1',
                uploadId: 'upload-abc',
                key: 'uploads/user-1/file.mp4',
                presignedUrls: ['https://presign-1.com', 'https://presign-2.com'],
                chunkSize: 5 * 1024 * 1024,
            });
        });

        it('saves uploadId inside the file metadata field', async () => {
            await service.initMultipartUpload('video.mp4', 100 * 1024 * 1024, 'video/mp4', 5 * 1024 * 1024, mockUser as any);

            expect(prisma.file.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        metadata: expect.objectContaining({ uploadId: 'upload-abc' }),
                    }),
                }),
            );
        });
    });

    // ---------------------------------------------------------------------------
    // completeMultipartUpload
    // ---------------------------------------------------------------------------

    describe('completeMultipartUpload', () => {
        const pendingFile = {
            id: 'file-1',
            userId: 'user-1',
            filename: 'video.mp4',
            originalFilename: 'video.mp4',
            mimeType: 'video/mp4',
            fileType: FileType.VIDEO,
            s3Key: 'uploads/user-1/file.mp4',
            uploadStatus: UploadStatus.UPLOADING,
            thumbnailPath: null,
        };

        const completeResult = {
            key: 'uploads/user-1/file.mp4',
            bucket: 'ragspace-uploads',
            url: 'https://s3.example.com/file',
            size: 100 * 1024 * 1024,
        };

        beforeEach(() => {
            prisma.file.findFirst.mockResolvedValue(pendingFile as any);
            s3Service.completeMultipartUpload.mockResolvedValue(completeResult as any);
            prisma.file.update.mockResolvedValue({ ...pendingFile, uploadStatus: UploadStatus.COMPLETED } as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
        });

        it('completes S3 upload, updates to COMPLETED/EMBEDDING, and publishes UPLOAD_COMPLETED', async () => {
            const parts = [{ ETag: 'etag1', PartNumber: 1 }];
            await service.completeMultipartUpload(
                'file-1', 'uploads/user-1/file.mp4', 'upload-abc', parts, 100 * 1024 * 1024, mockUser as any,
            );

            expect(s3Service.completeMultipartUpload).toHaveBeenCalledWith(
                'uploads/user-1/file.mp4', 'upload-abc', parts, 100 * 1024 * 1024,
            );
            expect(prisma.file.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'file-1' },
                    data: expect.objectContaining({
                        uploadStatus: UploadStatus.COMPLETED,
                        processingStatus: ProcessingStatus.IN_PROGRESS,
                        processingStage: ProcessingStage.EMBEDDING,
                    }),
                }),
            );
            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: FileEventType.UPLOAD_COMPLETED }),
            );
        });
    });

    // ---------------------------------------------------------------------------
    // abortMultipartUpload
    // ---------------------------------------------------------------------------

    describe('abortMultipartUpload', () => {
        const multipartFile = {
            id: 'file-1',
            userId: 'user-1',
            s3Key: 'uploads/user-1/file.mp4',
            uploadStatus: UploadStatus.UPLOADING,
            thumbnailPath: null,
            metadata: { uploadId: 'upload-abc' },
        };

        beforeEach(() => {
            prisma.file.findFirst.mockResolvedValue(multipartFile as any);
            s3Service.abortMultipartUpload.mockResolvedValue(undefined);
            prisma.file.delete.mockResolvedValue(multipartFile as any);
        });

        it('aborts S3 multipart upload and deletes the DB record', async () => {
            await service.abortMultipartUpload('file-1', mockUser as any);

            expect(s3Service.abortMultipartUpload).toHaveBeenCalledWith('uploads/user-1/file.mp4', 'upload-abc');
            expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
        });

        it('skips S3 abort when metadata has no uploadId and still deletes the DB record', async () => {
            prisma.file.findFirst.mockResolvedValue({ ...multipartFile, metadata: {} } as any);

            await service.abortMultipartUpload('file-1', mockUser as any);

            expect(s3Service.abortMultipartUpload).not.toHaveBeenCalled();
            expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
        });
    });

    // ---------------------------------------------------------------------------
    // reprocessFile
    // ---------------------------------------------------------------------------

    describe('reprocessFile', () => {
        const completedFile = {
            id: 'file-1',
            userId: 'user-1',
            originalFilename: 'video.mp4',
            fileSize: 1024,
            mimeType: 'video/mp4',
            fileType: FileType.VIDEO,
            s3Key: 'uploads/user-1/file.mp4',
            s3Url: 'https://s3.example.com/file',
            uploadStatus: UploadStatus.COMPLETED,
        };

        beforeEach(() => {
            prisma.file.findFirst.mockResolvedValue(completedFile as any);
            prisma.file.update.mockResolvedValue(completedFile as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
        });

        it('throws NotFoundException when the file does not exist', async () => {
            prisma.file.findFirst.mockResolvedValue(null);
            await expect(service.reprocessFile('missing', mockUser as any)).rejects.toThrow(NotFoundException);
        });

        it('throws when the file has not finished uploading', async () => {
            prisma.file.findFirst.mockResolvedValue({ ...completedFile, uploadStatus: UploadStatus.UPLOADING } as any);
            await expect(service.reprocessFile('file-1', mockUser as any)).rejects.toThrow(
                'Cannot reprocess a file that has not finished uploading',
            );
        });

        it('resets processingStatus to IN_PROGRESS/EMBEDDING and clears errorMessage', async () => {
            await service.reprocessFile('file-1', mockUser as any);

            expect(prisma.file.update).toHaveBeenCalledWith({
                where: { id: 'file-1' },
                data: {
                    processingStatus: ProcessingStatus.IN_PROGRESS,
                    processingStage: ProcessingStage.EMBEDDING,
                    errorMessage: null,
                },
            });
        });

        it('publishes UPLOAD_COMPLETED with isReprocess: true and returns success', async () => {
            const result = await service.reprocessFile('file-1', mockUser as any, mockSession as any);

            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: FileEventType.UPLOAD_COMPLETED,
                    data: expect.objectContaining({ isReprocess: true }),
                }),
            );
            expect(result).toEqual({ message: 'Reprocessing started', fileId: 'file-1' });
        });
    });

    // ---------------------------------------------------------------------------
    // submitYouTubeLink
    // ---------------------------------------------------------------------------

    describe('submitYouTubeLink', () => {
        const validUrls = [
            ['standard watch URL', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
            ['youtu.be short URL', 'https://youtu.be/dQw4w9WgXcQ'],
            ['embed URL', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
            ['shorts URL', 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
        ];

        beforeEach(() => {
            prisma.file.create.mockResolvedValue({
                id: 'file-yt-1',
                fileType: FileType.YOUTUBE_VIDEO,
                originalFilename: 'YouTube Video dQw4w9WgXcQ',
                uploadStatus: UploadStatus.COMPLETED,
            } as any);
            rabbitmqService.publishEvent.mockResolvedValue(undefined);
        });

        it('throws an error for a non-YouTube URL', async () => {
            await expect(
                service.submitYouTubeLink('https://vimeo.com/123456', mockUser as any),
            ).rejects.toThrow('Invalid YouTube URL');
        });

        it.each(validUrls)('accepts a %s', async (_label, url) => {
            await service.submitYouTubeLink(url, mockUser as any);
            expect(prisma.file.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ fileType: FileType.YOUTUBE_VIDEO, youtubeUrl: url }),
                }),
            );
        });

        it('creates record with COMPLETED upload status and IN_PROGRESS processing', async () => {
            await service.submitYouTubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', mockUser as any);
            expect(prisma.file.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        uploadStatus: UploadStatus.COMPLETED,
                        processingStatus: ProcessingStatus.IN_PROGRESS,
                        processingStage: ProcessingStage.EMBEDDING,
                    }),
                }),
            );
        });

        it('publishes an UPLOAD_COMPLETED event after creating the record', async () => {
            await service.submitYouTubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', mockUser as any);
            expect(rabbitmqService.publishEvent).toHaveBeenCalledWith(
                expect.objectContaining({ type: FileEventType.UPLOAD_COMPLETED }),
            );
        });
    });
});

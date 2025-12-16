import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { RabbitmqService, FileEventType } from '../rabbitmq/rabbitmq.service';
import {
    FileType,
    UploadStatus,
    ProcessingStatus,
    ProcessingStage,
} from '@prisma/client';
import { GetFilesQueryDto } from './dto/get-files-query.dto';
import { AuthUser } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
        private rabbitmqService: RabbitmqService,
    ) { }

    async uploadFile(file: Express.Multer.File, user: AuthUser) {
        try {
            const fileType = this.getFileTypeFromMimeType(file.mimetype);
            const fileRecord = await this.prisma.file.create({
                data: {
                    userId: user.id,
                    filename: file.originalname,
                    originalFilename: file.originalname,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    fileType,
                    s3Key: '',
                    s3Bucket: '',
                    uploadStatus: UploadStatus.UPLOADING,
                    processingStatus: ProcessingStatus.NOT_STARTED,
                    processingStage: ProcessingStage.UPLOAD,
                },
            });

            await this.rabbitmqService.publishEvent({
                type: FileEventType.UPLOAD_STARTED,
                fileId: fileRecord.id,
                user: user,
                timestamp: new Date(),
                data: {
                    fileName: file.originalname,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                },
            });

            try {
                const uploadResult = await this.s3Service.uploadFile(
                    file,
                    user.id,
                    (progress) => {
                        this.logger.debug(
                            `Upload progress for ${fileRecord.id}: ${progress}%`,
                        );
                    },
                );

                const updatedFile = await this.prisma.file.update({
                    where: { id: fileRecord.id },
                    data: {
                        s3Key: uploadResult.key,
                        s3Bucket: uploadResult.bucket,
                        s3Url: uploadResult.url,
                        uploadStatus: UploadStatus.COMPLETED,
                        uploadedAt: new Date(),
                        processingStatus: ProcessingStatus.IN_PROGRESS,
                        processingStage: ProcessingStage.EMBEDDING,
                    },
                });

                await this.rabbitmqService.publishEvent({
                    type: FileEventType.UPLOAD_COMPLETED,
                    fileId: fileRecord.id,
                    user: user,
                    timestamp: new Date(),
                    data: {
                        fileName: file.originalname,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        fileType,
                        s3Key: uploadResult.key,
                        s3Url: uploadResult.url,
                    },
                });

                this.logger.log(`File uploaded successfully: ${fileRecord.id}`);
                return updatedFile;
            } catch (error) {
                this.logger.error(
                    `S3 upload failed for file ${fileRecord.id}, deleting record`,
                    error,
                );

                await this.rabbitmqService.publishEvent({
                    type: FileEventType.UPLOAD_FAILED,
                    fileId: fileRecord.id,
                    user,
                    timestamp: new Date(),
                    data: {
                        error: error.message,
                    },
                });

                await this.prisma.file.delete({
                    where: { id: fileRecord.id },
                });

                throw error;
            }
        } catch (error) {
            this.logger.error(`Error uploading file for user ${user.id}`, error);
            throw error;
        }
    }

    async updateFile(id: string, data: Partial<any>) {
        return this.prisma.file.update({
            where: { id },
            data,
        });
    }

    async getFileById(id: string, userId: string) {
        const file = await this.prisma.file.findFirst({
            where: {
                id,
                userId,
            },
        });

        if (!file) {
            throw new NotFoundException(`File with ID ${id} not found`);
        }

        if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
            const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
            return {
                ...file,
                s3Url: signedUrl,
            };
        }

        return file;
    }

    async getFileByIds(ids: string[], userId: string, query?: GetFilesQueryDto) {
        const { uploadStatus, processingStatus } = query || {};
        const where: any = { userId };
        if (uploadStatus) {
            where.uploadStatus = uploadStatus;
        }
        if (processingStatus) {
            where.processingStatus = processingStatus;
        }
        where.id = { in: ids };
        const files = await this.prisma.file.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        const filesWithUrls = files.map(async (file) => {
            try {
                if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
                    const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
                    file.s3Url = signedUrl;
                }
            } catch (error) {
                this.logger.error(`Failed to get signed URL for file ${file.id}`, error);
            }
            return file;
        });

        return await Promise.all(filesWithUrls);
    }

    async getFiles(userId: string, query: GetFilesQueryDto) {
        const { page = 1, limit: _limit = 20, uploadStatus, processingStatus } = query;
        const limit = parseInt(_limit as any, 10);
        const skip = (page - 1) * limit;

        const where: any = { userId };

        if (uploadStatus) {
            where.uploadStatus = uploadStatus;
        }

        if (processingStatus) {
            where.processingStatus = processingStatus;
        }

        const [files, total] = await Promise.all([
            this.prisma.file.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.file.count({ where }),
        ]);

        const filesWithUrls = files.map(async (file) => {
            try {
                if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
                    const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
                    file.s3Url = signedUrl;
                }
            } catch (error) {
                this.logger.error(`Failed to get signed URL for file ${file.id}`, error);
            }
            return file;
        });

        return {
            files: await Promise.all(filesWithUrls),
            total,
            page,
            limit,
        };
    }

    async deleteFile(id: string, user: AuthUser) {
        const file = await this.getFileById(id, user.id);

        // Publish deletion event to notify other services (file-embedder) to clean up
        try {
            await this.rabbitmqService.publishEvent({
                type: FileEventType.FILE_DELETED,
                fileId: id,
                user: user,
                timestamp: new Date(),
                data: {
                    fileType: file.fileType,
                    fileName: file.filename,
                },
            });
            this.logger.log(`Published file deletion event for: ${id}`);
        } catch (error) {
            this.logger.error(`Failed to publish file deletion event: ${error.message}`);
            // Continue with deletion even if event publishing fails
        }

        // Delete from S3
        if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
            try {
                await this.s3Service.deleteFile(file.s3Key);
                this.logger.log(`Deleted S3 file: ${file.s3Key}`);
            } catch (error) {
                this.logger.error(`Failed to delete S3 file: ${error.message}`);
            }
        }

        // Delete from database
        await this.prisma.file.delete({
            where: { id },
        });

        this.logger.log(`File deleted from database: ${id}`);
        return { message: 'File deleted successfully' };
    }

    private getFileTypeFromMimeType(mimeType: string): FileType {
        if (mimeType.startsWith('image/')) return FileType.IMAGE;
        if (mimeType.startsWith('video/')) return FileType.VIDEO;
        if (mimeType.startsWith('audio/')) return FileType.AUDIO;
        if (
            mimeType.includes('pdf') ||
            mimeType.includes('document') ||
            mimeType.includes('text')
        ) {
            return FileType.DOCUMENT;
        }
        return FileType.OTHER;
    }

    async initMultipartUpload(
        fileName: string,
        fileSize: number,
        mimeType: string,
        chunkSize: number,
        user: AuthUser,
    ) {
        try {
            const fileType = this.getFileTypeFromMimeType(mimeType);

            // Initialize multipart upload in S3 first to get the s3Key
            const uploadInit = await this.s3Service.initMultipartUpload(
                fileName,
                fileSize,
                mimeType,
                user.id,
                chunkSize,
            );

            // Create file record with the generated s3Key
            const fileRecord = await this.prisma.file.create({
                data: {
                    userId: user.id,
                    filename: fileName,
                    originalFilename: fileName,
                    fileSize: fileSize,
                    mimeType: mimeType,
                    fileType,
                    s3Key: uploadInit.key,
                    s3Bucket: uploadInit.bucket,
                    uploadStatus: UploadStatus.UPLOADING,
                    processingStatus: ProcessingStatus.NOT_STARTED,
                    processingStage: ProcessingStage.UPLOAD,
                    metadata: {
                        uploadId: uploadInit.uploadId,
                        chunkSize,
                        totalChunks: uploadInit.presignedUrls.length,
                    },
                },
            });

            this.logger.log(`Multipart upload initialized for file: ${fileRecord.id}`);

            return {
                fileId: fileRecord.id,
                uploadId: uploadInit.uploadId,
                key: uploadInit.key,
                presignedUrls: uploadInit.presignedUrls,
                chunkSize,
                file: fileRecord,
            };
        } catch (error) {
            this.logger.error('Error initializing multipart upload', error);
            throw error;
        }
    }

    async completeMultipartUpload(
        fileId: string,
        key: string,
        uploadId: string,
        parts: Array<{ ETag: string; PartNumber: number }>,
        totalSize: number,
        user: AuthUser,
    ) {
        try {
            const fileRecord = await this.getFileById(fileId, user.id);

            // Complete multipart upload in S3
            const uploadResult = await this.s3Service.completeMultipartUpload(
                key,
                uploadId,
                parts,
            );

            // Update file record
            const updatedFile = await this.prisma.file.update({
                where: { id: fileId },
                data: {
                    s3Url: uploadResult.url,
                    fileSize: totalSize,
                    uploadStatus: UploadStatus.COMPLETED,
                    uploadedAt: new Date(),
                    processingStatus: ProcessingStatus.IN_PROGRESS,
                    processingStage: ProcessingStage.EMBEDDING,
                },
            });

            // Publish upload completed event
            await this.rabbitmqService.publishEvent({
                type: FileEventType.UPLOAD_COMPLETED,
                fileId: fileRecord.id,
                user: user,
                timestamp: new Date(),
                data: {
                    fileName: fileRecord.originalFilename,
                    fileSize: totalSize,
                    mimeType: fileRecord.mimeType,
                    fileType: fileRecord.fileType,
                    s3Key: uploadResult.key,
                    s3Url: uploadResult.url,
                },
            });

            this.logger.log(`Multipart upload completed for file: ${fileId}`);
            return updatedFile;
        } catch (error) {
            this.logger.error('Error completing multipart upload', error);
            throw error;
        }
    }

    async abortMultipartUpload(fileId: string, user: AuthUser) {
        try {
            const fileRecord = await this.getFileById(fileId, user.id);
            const metadata = fileRecord.metadata as any;

            // Only try to abort if this was a multipart upload
            if (metadata?.uploadId && fileRecord.s3Key) {
                try {
                    await this.s3Service.abortMultipartUpload(
                        fileRecord.s3Key,
                        metadata.uploadId,
                    );
                } catch (s3Error) {
                    // If abort fails (upload already completed/aborted), log but continue with deletion
                    this.logger.warn(`Failed to abort multipart upload for ${fileId}: ${s3Error.message}`);
                }
            } else {
                this.logger.log(`File ${fileId} was not a multipart upload, skipping abort`);
            }

            // Delete the file record regardless of abort outcome
            await this.prisma.file.delete({
                where: { id: fileId },
            });

            this.logger.log(`File record deleted: ${fileId}`);
            return { message: 'Upload aborted successfully' };
        } catch (error) {
            this.logger.error('Error aborting multipart upload', error);
            throw error;
        }
    }
}

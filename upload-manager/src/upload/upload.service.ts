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
import { AuthUser, AuthSession } from 'src/common/decorators/current-user.decorator';

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
        private rabbitmqService: RabbitmqService,
    ) { }

    async uploadFile(file: Express.Multer.File, user: AuthUser, session?: AuthSession) {
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
                session: session,
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
                    session: session,
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
                    session: session,
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
        const updateData = { ...data };
        if (data.metadata && data.metadata.thumbnailPath) {
            updateData.thumbnailPath = data.metadata.thumbnailPath;
            const { thumbnailPath, ...restMetadata } = data.metadata;
            if (Object.keys(restMetadata).length > 0) {
                updateData.metadata = restMetadata;
            } else {
                delete updateData.metadata;
            }
        }

        this.logger.log(`Updating file ${id} with data:`, JSON.stringify(updateData));

        return this.prisma.file.update({
            where: { id },
            data: updateData,
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

        if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key && file.fileType !== FileType.YOUTUBE_VIDEO) {
            const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
            let thumbnailUrl: string | null = null;
            if (file.thumbnailPath) {
                try {
                    thumbnailUrl = await this.s3Service.getSignedUrl(file.thumbnailPath);
                } catch (error) {
                    this.logger.error(`Failed to generate signed URL for thumbnail ${file.thumbnailPath}:`, error);
                }
            }
            return {
                ...file,
                s3Url: signedUrl,
                thumbnailUrl,
            };
        }

        if (file.fileType === FileType.YOUTUBE_VIDEO && file.thumbnailPath) {
            try {
                const thumbnailUrl = await this.s3Service.getSignedUrl(file.thumbnailPath);
                return {
                    ...file,
                    s3Url: null,
                    thumbnailUrl,
                };
            } catch (error) {
                this.logger.error(`Failed to generate signed URL for thumbnail ${file.thumbnailPath}:`, error);
            }
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
                // Only generate S3 URLs for non-YouTube videos
                if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key && file.fileType !== FileType.YOUTUBE_VIDEO) {
                    const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
                    file.s3Url = signedUrl;
                } else if (file.fileType === FileType.YOUTUBE_VIDEO) {
                    file.s3Url = null;
                }
            } catch (error) {
                this.logger.error(`Failed to get signed URL for file ${file.id}:`, error);
            }

            if (file.thumbnailPath) {
                try {
                    const thumbnailUrl = await this.s3Service.getSignedUrl(file.thumbnailPath);
                    (file as any).thumbnailUrl = thumbnailUrl;
                } catch (error) {
                    this.logger.error(`Failed to get signed URL for thumbnail ${file.thumbnailPath}:`, error);
                }
            }
            return file;
        });

        return {
            files: await Promise.all(filesWithUrls),
            total: files.length,
            page: 1,
            limit: files.length,
        };
    }

    async getFiles(userId: string, query: GetFilesQueryDto) {
        const { page = 1, limit: _limit = 20, uploadStatus, processingStatus, processingStage } = query;
        const limit = parseInt(_limit as any, 10);
        const skip = (page - 1) * limit;

        const where: any = { userId };

        if (uploadStatus) {
            where.uploadStatus = uploadStatus;
        }

        if (processingStatus) {
            where.processingStatus = processingStatus;
        }

        if (processingStage) {
            where.processingStage = processingStage;
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
                // Only generate S3 URLs for non-YouTube videos
                if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key && file.fileType !== FileType.YOUTUBE_VIDEO) {
                    const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
                    file.s3Url = signedUrl;
                } else if (file.fileType === FileType.YOUTUBE_VIDEO) {
                    file.s3Url = null;
                }
            } catch (error) {
                this.logger.error(`Failed to get signed URL for file ${file.id}:`, error);
            }

            if (file.thumbnailPath) {
                try {
                    const thumbnailUrl = await this.s3Service.getSignedUrl(file.thumbnailPath);
                    (file as any).thumbnailUrl = thumbnailUrl;
                } catch (error) {
                    this.logger.error(`Failed to get signed URL for thumbnail ${file.thumbnailPath}:`, error);
                }
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

    async getStorageStats(userId: string) {
        const result = await this.prisma.file.aggregate({
            where: {
                userId,
                uploadStatus: UploadStatus.COMPLETED
            },
            _sum: {
                fileSize: true,
            },
            _count: true,
        });

        const usedBytes = result._sum.fileSize || 0;
        const totalBytes = 100 * 1024 * 1024 * 1024; // 100GB in bytes
        const fileCount = result._count;

        return {
            usedBytes,
            totalBytes,
            usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
            totalGB: 100,
            usedPercentage: ((usedBytes / totalBytes) * 100).toFixed(1),
            fileCount,
        };
    }

    async deleteFile(id: string, user: AuthUser) {
        const file = await this.getFileById(id, user.id);
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

        // Delete thumbnail from S3 if exists
        if ((file as any).thumbnailPath) {
            try {
                await this.s3Service.deleteFile((file as any).thumbnailPath);
                this.logger.log(`Deleted S3 thumbnail: ${(file as any).thumbnailPath}`);
            } catch (error) {
                this.logger.error(`Failed to delete S3 thumbnail: ${error.message}`);
            }
        }

        // Delete from database
        await this.prisma.file.delete({
            where: { id },
        });

        this.logger.log(`File deleted from database: ${id}`);
        return { message: 'File deleted successfully' };
    }

    async deleteFiles(ids: string[], user: AuthUser) {
        const files = await this.prisma.file.findMany({
            where: {
                id: { in: ids },
                userId: user.id,
            },
        });

        if (files.length === 0) {
            return { message: 'No files found', deletedCount: 0 };
        }

        try {
            await this.rabbitmqService.publishEvent({
                type: FileEventType.FILE_DELETED,
                fileIds: files.map(f => f.id),
                user: user,
                timestamp: new Date(),
                data: {
                    fileType: files[0].fileType,
                    fileName: `${files.length} files`
                },
            });
            this.logger.log(`Published batch file deletion event for ${files.length} files`);
        } catch (error) {
            this.logger.error(`Failed to publish batch file deletion event: ${error.message}`);
        }

        // Delete from S3
        for (const file of files) {
            if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
                try {
                    await this.s3Service.deleteFile(file.s3Key);
                    this.logger.log(`Deleted S3 file: ${file.s3Key}`);
                } catch (error) {
                    this.logger.error(`Failed to delete S3 file ${file.s3Key}: ${error.message}`);
                }
            }

            if ((file as any).thumbnailPath) {
                try {
                    await this.s3Service.deleteFile((file as any).thumbnailPath);
                    this.logger.log(`Deleted S3 thumbnail: ${(file as any).thumbnailPath}`);
                } catch (error) {
                    this.logger.error(`Failed to delete S3 thumbnail: ${error.message}`);
                }
            }
        }

        const deleteResult = await this.prisma.file.deleteMany({
            where: { id: { in: files.map(f => f.id) } },
        });

        this.logger.log(`Batch deleted ${deleteResult.count} files from database`);
        return { message: `${deleteResult.count} files deleted successfully`, deletedCount: deleteResult.count };
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
        chunkSize: number = 5 * 1024 * 1024,
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

    async submitYouTubeLink(url: string, user: AuthUser, session?: AuthSession) {
        try {
            // Extract video ID from YouTube URL
            const videoIdMatch = url.match(
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/
            );

            if (!videoIdMatch) {
                throw new Error('Invalid YouTube URL - could not extract video ID');
            }

            const videoId = videoIdMatch[1];

            // Fetch YouTube metadata
            let metadata: any = {
                videoId,
                source: 'youtube',
            };

            try {
                // Use yt-dlp via exec to get video info
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);

                const { stdout } = await execAsync(
                    `yt-dlp --dump-json --no-download "${url}"`,
                    { timeout: 15000 }
                );

                const videoInfo = JSON.parse(stdout);
                const title = videoInfo.title || `YouTube Video ${videoId}`;
                const filename = `${title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}_${videoId}.mp4`;

                metadata = {
                    ...metadata,
                    title: videoInfo.title,
                    description: videoInfo.description,
                    duration: videoInfo.duration,
                    uploader: videoInfo.uploader,
                    uploadDate: videoInfo.upload_date,
                    viewCount: videoInfo.view_count,
                    likeCount: videoInfo.like_count,
                    thumbnail: videoInfo.thumbnail,
                };

                this.logger.log(`Fetched YouTube metadata: ${title}`);
            } catch (metaError) {
                this.logger.warn(`Failed to fetch YouTube metadata, using defaults: ${metaError.message}`);
            }

            const displayTitle = metadata.title || `YouTube Video ${videoId}`;
            const filename = metadata.title
                ? `${metadata.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}_${videoId}.mp4`
                : `youtube_${videoId}.mp4`;

            // Create file record with metadata
            const fileRecord = await this.prisma.file.create({
                data: {
                    userId: user.id,
                    filename,
                    originalFilename: displayTitle,
                    fileSize: 0, // Will be updated when downloaded
                    mimeType: 'video/mp4',
                    fileType: FileType.YOUTUBE_VIDEO,
                    s3Key: `${user.id}/youtube/${videoId}.mp4`,
                    s3Bucket: '',
                    youtubeUrl: url,
                    metadata: metadata,
                    uploadStatus: UploadStatus.COMPLETED,
                    uploadedAt: new Date(),
                    processingStatus: ProcessingStatus.IN_PROGRESS,
                    processingStage: ProcessingStage.EMBEDDING,
                },
            });

            // Publish YouTube submission event
            await this.rabbitmqService.publishEvent({
                type: FileEventType.UPLOAD_COMPLETED,
                fileId: fileRecord.id,
                user: user,
                session: session,
                timestamp: new Date(),
                data: {
                    fileName: fileRecord.originalFilename,
                    fileSize: 0,
                    mimeType: 'video/mp4',
                    fileType: FileType.YOUTUBE_VIDEO,
                    youtubeUrl: url,
                    videoId: videoId,
                    s3Key: fileRecord.s3Key,
                    s3Url: null, // YouTube videos don't have S3 URLs initially
                    metadata: metadata,
                },
            });

            this.logger.log(`YouTube link submitted successfully: ${fileRecord.id}, URL: ${url}`);
            return fileRecord;
        } catch (error) {
            this.logger.error(`Error submitting YouTube link for user ${user.id}`, error);
            throw error;
        }
    }
}

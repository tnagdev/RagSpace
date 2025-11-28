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

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
        private rabbitmqService: RabbitmqService,
    ) { }

    async uploadFile(file: Express.Multer.File, userId: string) {
        this.logger.log(
            `Starting file upload for user: ${userId}, file: ${file.originalname}`,
        );

        try {
            // Determine file type from mimetype
            const fileType = this.getFileTypeFromMimeType(file.mimetype);

            // Create initial file record
            const fileRecord = await this.prisma.file.create({
                data: {
                    userId,
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

            // Publish upload started event
            await this.rabbitmqService.publishEvent({
                type: FileEventType.UPLOAD_STARTED,
                fileId: fileRecord.id,
                userId,
                timestamp: new Date(),
                data: {
                    filename: file.originalname,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                },
            });

            try {
                // Upload to S3
                const uploadResult = await this.s3Service.uploadFile(
                    file,
                    userId,
                    (progress) => {
                        this.logger.debug(
                            `Upload progress for ${fileRecord.id}: ${progress}%`,
                        );
                    },
                );

                // Update file record with S3 information
                const updatedFile = await this.prisma.file.update({
                    where: { id: fileRecord.id },
                    data: {
                        s3Key: uploadResult.key,
                        s3Bucket: uploadResult.bucket,
                        s3Url: uploadResult.url,
                        uploadStatus: UploadStatus.COMPLETED,
                        uploadedAt: new Date(),
                    },
                });

                // Publish upload completed event
                await this.rabbitmqService.publishEvent({
                    type: FileEventType.UPLOAD_COMPLETED,
                    fileId: fileRecord.id,
                    userId,
                    timestamp: new Date(),
                    data: {
                        s3Key: uploadResult.key,
                        s3Url: uploadResult.url,
                        fileType,
                    },
                });

                this.logger.log(`File uploaded successfully: ${fileRecord.id}`);
                return updatedFile;
            } catch (error) {
                this.logger.error(
                    `S3 upload failed for file ${fileRecord.id}, deleting record`,
                    error,
                );

                // Publish upload failed event before deletion
                await this.rabbitmqService.publishEvent({
                    type: FileEventType.UPLOAD_FAILED,
                    fileId: fileRecord.id,
                    userId,
                    timestamp: new Date(),
                    data: {
                        error: error.message,
                    },
                });

                // Delete the file record from database
                await this.prisma.file.delete({
                    where: { id: fileRecord.id },
                });

                throw error;
            }
        } catch (error) {
            this.logger.error(`Error uploading file for user ${userId}`, error);
            throw error;
        }
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

        // Generate fresh signed URL if file is completed
        if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
            const signedUrl = await this.s3Service.getSignedUrl(file.s3Key);
            return {
                ...file,
                s3Url: signedUrl,
            };
        }

        return file;
    }

    async getFiles(userId: string, query: GetFilesQueryDto) {
        const { page = 1, limit = 20, uploadStatus, processingStatus } = query;
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

        return {
            files,
            total,
            page,
            limit,
        };
    }

    async deleteFile(id: string, userId: string) {
        const file = await this.getFileById(id, userId);

        if (file.uploadStatus === UploadStatus.COMPLETED && file.s3Key) {
            await this.s3Service.deleteFile(file.s3Key);
        }

        await this.prisma.file.delete({
            where: { id },
        });

        this.logger.log(`File deleted: ${id}`);
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
}

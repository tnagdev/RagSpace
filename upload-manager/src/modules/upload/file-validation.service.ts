import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentClientService, UsageMetricType } from '../../common/payment';
import { FileType } from '@prisma/client';
import * as ffprobe from 'ffprobe';
import * as ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

export interface FileValidationResult {
    isValid: boolean;
    fileType: FileType;
    metadata: {
        duration?: number;
        width?: number;
        height?: number;
        size: number;
    };
    message?: string;
}

@Injectable()
export class FileValidationService {
    private readonly logger = new Logger(FileValidationService.name);

    constructor(private paymentClient: PaymentClientService) { }

    /**
     * Validate file against user's plan limits
     */
    async validateFile(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number; originalname: string },
        userId: string,
    ): Promise<FileValidationResult> {
        const fileType = this.getFileTypeFromMimeType(file.mimetype);

        // Block document uploads
        if (fileType === FileType.DOCUMENT) {
            throw new BadRequestException(
                'Document uploads are not supported at this time. Supported formats: images, videos, and audio files.',
            );
        }

        // Check storage quota
        const storageCheck = await this.paymentClient.checkUsage(
            userId,
            UsageMetricType.STORAGE,
            file.size,
        );

        if (!storageCheck.allowed) {
            const limitGB = storageCheck.limit === 'unlimited'
                ? 'unlimited'
                : `${((storageCheck.limit as number) / (1024 * 1024 * 1024)).toFixed(2)}GB`;
            const fileGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);

            throw new ForbiddenException(
                `Storage quota exceeded. Your plan allows ${limitGB}, and this ${fileGB}GB file would exceed your limit.`,
            );
        }

        // Type-specific validations
        switch (fileType) {
            case FileType.VIDEO:
                return await this.validateVideo(file, userId);
            case FileType.IMAGE:
                return await this.validateImage(file, userId);
            case FileType.AUDIO:
                return await this.validateAudio(file, userId);
            default:
                return {
                    isValid: true,
                    fileType,
                    metadata: { size: file.size },
                };
        }
    }

    /**
     * Write file buffer to a temp path, run ffprobe, then clean up.
     */
    private async probeMediaFile(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number },
    ): Promise<ffprobe.FfprobeData> {
        if (file.buffer) {
            const tempPath = join(tmpdir(), `${Date.now()}-${Math.random()}.tmp`);
            await fs.writeFile(tempPath, file.buffer);
            try {
                return await ffprobe(tempPath, { path: ffprobeStatic.path });
            } finally {
                await fs.unlink(tempPath).catch(() => { });
            }
        } else if ((file as any).path) {
            return ffprobe((file as any).path, { path: ffprobeStatic.path });
        } else {
            throw new Error('File must have either buffer or path');
        }
    }

    /**
     * Validate video file duration
     */
    private async validateVideo(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number },
        userId: string,
    ): Promise<FileValidationResult> {
        try {
            // Get video metadata using ffprobe
            const probeData = await this.probeMediaFile(file);
            const duration = probeData.streams[0]?.duration || 0;

            // Check against MAX_VIDEO_LENGTH from payment service
            const videoLengthCheck = await this.paymentClient.checkUsage(
                userId,
                UsageMetricType.MAX_VIDEO_LENGTH,
                Math.ceil(duration),
            );

            if (!videoLengthCheck.allowed) {
                const maxMinutes = videoLengthCheck.limit === 'unlimited'
                    ? 'unlimited'
                    : `${Math.floor((videoLengthCheck.limit as number) / 60)} minutes`;
                const currentMinutes = Math.floor(duration / 60);
                const currentSeconds = Math.floor(duration % 60);

                throw new ForbiddenException(
                    `Video duration exceeds plan limit. Your plan allows videos up to ${maxMinutes}. This video is ${currentMinutes}m ${currentSeconds}s.`,
                );
            }

            return {
                isValid: true,
                fileType: FileType.VIDEO,
                metadata: {
                    duration: Math.ceil(duration),
                    size: file.size,
                },
            };
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof BadRequestException) {
                throw error;
            }

            this.logger.error(`Error validating video: ${error.message}`);
            throw new BadRequestException(
                'Failed to validate video file. Please ensure the file is a valid video format.',
            );
        }
    }

    /**
     * Validate image - extract metadata without dimension restrictions
     */
    private async validateImage(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number },
        userId: string,
    ): Promise<FileValidationResult> {
        try {
            let metadata: sharp.Metadata;

            if (file.buffer) {
                metadata = await sharp(file.buffer).metadata();
            } else if ((file as any).path) {
                metadata = await sharp((file as any).path).metadata();
            } else {
                throw new Error('File must have either buffer or path');
            }

            const width = metadata.width || 0;
            const height = metadata.height || 0;

            return {
                isValid: true,
                fileType: FileType.IMAGE,
                metadata: {
                    width,
                    height,
                    size: file.size,
                },
            };
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof BadRequestException) {
                throw error;
            }

            this.logger.error(`Error validating image: ${error.message}`);
            throw new BadRequestException(
                'Failed to validate image file. Please ensure the file is a valid image format.',
            );
        }
    }

    /**
     * Validate audio duration
     */
    private async validateAudio(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number },
        userId: string,
    ): Promise<FileValidationResult> {
        try {
            // Get audio metadata using ffprobe
            const probeData = await this.probeMediaFile(file);
            const duration = probeData.streams[0]?.duration || 0;

            // Check against MAX_AUDIO_DURATION from payment service
            const audioDurationCheck = await this.paymentClient.checkUsage(
                userId,
                UsageMetricType.MAX_AUDIO_DURATION,
                Math.ceil(duration),
            );

            if (!audioDurationCheck.allowed) {
                const maxMinutes = audioDurationCheck.limit === 'unlimited'
                    ? 'unlimited'
                    : `${Math.floor((audioDurationCheck.limit as number) / 60)} minutes`;
                const currentMinutes = Math.floor(duration / 60);
                const currentSeconds = Math.floor(duration % 60);

                throw new ForbiddenException(
                    `Audio duration exceeds plan limit. Your plan allows audio up to ${maxMinutes}. This audio is ${currentMinutes}m ${currentSeconds}s.`,
                );
            }

            return {
                isValid: true,
                fileType: FileType.AUDIO,
                metadata: {
                    duration: Math.ceil(duration),
                    size: file.size,
                },
            };
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof BadRequestException) {
                throw error;
            }

            this.logger.error(`Error validating audio: ${error.message}`);
            throw new BadRequestException(
                'Failed to validate audio file. Please ensure the file is a valid audio format.',
            );
        }
    }

    /**
     * Determine file type from MIME type
     */
    private getFileTypeFromMimeType(mimeType: string): FileType {
        if (mimeType.startsWith('image/')) return FileType.IMAGE;
        if (mimeType.startsWith('video/')) return FileType.VIDEO;
        if (mimeType.startsWith('audio/')) return FileType.AUDIO;
        if (
            mimeType.includes('pdf') ||
            mimeType.includes('document') ||
            mimeType.includes('text') ||
            mimeType.includes('msword') ||
            mimeType.includes('wordprocessing') ||
            mimeType.includes('spreadsheet') ||
            mimeType.includes('presentation')
        ) {
            return FileType.DOCUMENT;
        }
        return FileType.OTHER;
    }
}

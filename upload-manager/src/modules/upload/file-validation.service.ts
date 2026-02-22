import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentClientService, UsageMetricType } from '../../common/payment';
import { FileType } from '@prisma/client';
import * as ffprobe from 'ffprobe';
import * as ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

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

export interface PlanLimits {
    maxVideoLength?: number; // in seconds, 0 = unlimited
    maxStorage?: number; // in bytes, 0 = unlimited
    maxAudioDuration?: number; // in seconds
}

@Injectable()
export class FileValidationService {
    private readonly logger = new Logger(FileValidationService.name);

    // Default limits if payment service is unavailable
    private readonly DEFAULT_LIMITS: PlanLimits = {
        maxVideoLength: 600, // 10 minutes
        maxStorage: 1 * 1024 * 1024 * 1024, // 1GB
        maxAudioDuration: 3600, // 1 hour
    };

    constructor(private paymentClient: PaymentClientService) { }

    /**
     * Get user's plan limits or use defaults as fallback
     */
    private async getUserLimits(userId: string): Promise<PlanLimits> {
        try {
            const limits = await this.paymentClient.getUserPlanLimits(userId);
            if (!limits) {
                this.logger.warn(`Could not fetch plan limits for user ${userId}, using defaults`);
                return this.DEFAULT_LIMITS;
            }

            // Map payment service limits to our PlanLimits structure
            // Use 0 to represent unlimited, otherwise use the limit or default
            return {
                maxVideoLength: limits['MAX_VIDEO_LENGTH'] ?? this.DEFAULT_LIMITS.maxVideoLength,
                maxStorage: limits['STORAGE'] ?? this.DEFAULT_LIMITS.maxStorage,
                maxAudioDuration: limits['MAX_AUDIO_DURATION'] ?? this.DEFAULT_LIMITS.maxAudioDuration,
            };
        } catch (error) {
            this.logger.error(`Error fetching user limits: ${error.message}`);
            return this.DEFAULT_LIMITS;
        }
    }

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
     * Validate video file duration
     */
    private async validateVideo(
        file: Express.Multer.File | { buffer?: Buffer; path?: string; mimetype: string; size: number },
        userId: string,
    ): Promise<FileValidationResult> {
        try {
            let duration: number;

            // Get video metadata using ffprobe
            if (file.buffer) {
                // For in-memory files, we need to write to a temp file
                const tempPath = `/tmp/${Date.now()}-${Math.random()}.tmp`;
                const fs = require('fs').promises;
                await fs.writeFile(tempPath, file.buffer);

                try {
                    const metadata = await ffprobe(tempPath, { path: ffprobeStatic.path });
                    duration = metadata.streams[0]?.duration || 0;
                } finally {
                    await fs.unlink(tempPath).catch(() => { });
                }
            } else if ((file as any).path) {
                const metadata = await ffprobe((file as any).path, { path: ffprobeStatic.path });
                duration = metadata.streams[0]?.duration || 0;
            } else {
                throw new Error('File must have either buffer or path');
            }

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
            let duration: number;

            // Get audio metadata using ffprobe
            if (file.buffer) {
                const tempPath = `/tmp/${Date.now()}-${Math.random()}.tmp`;
                const fs = require('fs').promises;
                await fs.writeFile(tempPath, file.buffer);

                try {
                    const metadata = await ffprobe(tempPath, { path: ffprobeStatic.path });
                    duration = metadata.streams[0]?.duration || 0;
                } finally {
                    await fs.unlink(tempPath).catch(() => { });
                }
            } else if ((file as any).path) {
                const metadata = await ffprobe((file as any).path, { path: ffprobeStatic.path });
                duration = metadata.streams[0]?.duration || 0;
            } else {
                throw new Error('File must have either buffer or path');
            }

            // Get user's plan limits
            const userLimits = await this.getUserLimits(userId);
            const maxAudioDuration = userLimits.maxAudioDuration!;

            // Skip validation if limit is 0 (unlimited)
            if (maxAudioDuration > 0 && duration > maxAudioDuration) {
                const maxMinutes = Math.floor(maxAudioDuration / 60);
                const currentMinutes = Math.floor(duration / 60);
                const currentSeconds = Math.floor(duration % 60);

                throw new ForbiddenException(
                    `Audio duration exceeds plan limit. Maximum allowed: ${maxMinutes} minutes. This audio is ${currentMinutes}m ${currentSeconds}s.`,
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

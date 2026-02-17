import { SetMetadata } from '@nestjs/common';
import { FileType } from '@prisma/client';

/**
 * Configuration for file-specific quota checks
 */
export interface FileQuotaConfig {
    // Whether to validate video duration
    validateVideoDuration?: boolean;
    // Whether to validate image dimensions
    validateImageDimensions?: boolean;
    // Whether to validate audio duration
    validateAudioDuration?: boolean;
    // Whether to block documents
    blockDocuments?: boolean;
    // Whether to check storage quota
    checkStorage?: boolean;
    // Custom amount getter (for multipart uploads where file isn't available yet)
    getFileSize?: (request: any) => number;
    getFileName?: (request: any) => string;
    getMimeType?: (request: any) => string;
}

/**
 * Decorator for comprehensive file upload validation with quota checks
 * 
 * Automatically validates:
 * - Storage quota
 * - Video duration (against MAX_VIDEO_LENGTH)
 * - Image dimensions
 * - Audio duration
 * - Document blocking
 * 
 * @example
 * @Post()
 * @UseInterceptors(FileInterceptor('file'))
 * @ValidateFileUpload({
 *   validateVideoDuration: true,
 *   validateImageDimensions: true,
 *   blockDocuments: true,
 *   checkStorage: true
 * })
 * async uploadFile(@CurrentUser() user, @UploadedFile() file) {}
 * 
 * @example
 * // For multipart init without file yet
 * @Post('multipart/init')
 * @ValidateFileUpload({
 *   checkStorage: true,
 *   getFileSize: (req) => req.body.fileSize,
 *   getMimeType: (req) => req.body.mimeType
 * })
 * async initMultipart(@Body() dto: InitDto) {}
 */
export const ValidateFileUpload = (config: FileQuotaConfig = {}) => {
    const defaultConfig: FileQuotaConfig = {
        validateVideoDuration: true,
        validateImageDimensions: true,
        validateAudioDuration: true,
        blockDocuments: true,
        checkStorage: true,
        ...config,
    };
    return SetMetadata('fileQuota', defaultConfig);
};

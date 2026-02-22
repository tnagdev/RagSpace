import { Injectable, CanActivate, ExecutionContext, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FileQuotaConfig } from './file-quota.decorator';
import { FileValidationService } from '../../modules/upload/file-validation.service';

@Injectable()
export class FileQuotaGuard implements CanActivate {
    private readonly logger = new Logger(FileQuotaGuard.name);

    constructor(
        private reflector: Reflector,
        private fileValidationService: FileValidationService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const config = this.reflector.get<FileQuotaConfig>(
            'fileQuota',
            context.getHandler(),
        );

        if (!config) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.id) {
            this.logger.warn('No user found in request for file quota check');
            return true;
        }

        let file = request.file;
        if (!file && config.getFileSize && config.getMimeType) {
            file = {
                size: config.getFileSize(request),
                mimetype: config.getMimeType(request),
                originalname: config.getFileName ? config.getFileName(request) : 'unknown',
            };
        }

        if (!file) {
            this.logger.warn('No file found in request for validation');
            return true;
        }

        try {
            const validationResult = await this.fileValidationService.validateFile(
                file,
                user.id,
            );

            request.fileValidation = {
                fileType: validationResult.fileType,
                metadata: validationResult.metadata,
                userId: user.id,
            };

            this.logger.log(
                `File validation passed for user ${user.id}: ${file.originalname}`,
            );

            return true;
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof ForbiddenException) {
                throw error;
            }

            this.logger.error(`File validation error: ${error.message}`, error.stack);
            throw new BadRequestException('File validation failed');
        }
    }
}

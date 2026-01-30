import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Logger,
    Put,
    Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser, AuthSession } from '../common/decorators/current-user.decorator';
import { CurrentUser, CurrentSession } from '../common/decorators/current-user.decorator';
import { GetFilesQueryDto } from './dto/get-files-query.dto';
import { ConfigService } from '@nestjs/config';
import { UpdateFileDto } from './dto/update-file.dto';
import { InitMultipartUploadDto } from './dto/init-multipart.dto';
import { CompleteMultipartUploadDto } from './dto/complete-multipart.dto';
import { SubmitYouTubeLinkDto } from './dto/submit-youtube-link.dto';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
    private readonly logger = new Logger(UploadController.name);
    private readonly maxFileSize!: number;

    constructor(
        private readonly uploadService: UploadService,
        private readonly configService: ConfigService,
    ) {
        this.maxFileSize =
            this.configService.get<number>('upload.maxFileSize') as number;
    }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile()
        file: Express.Multer.File,
        @CurrentUser() user: AuthUser,
        @CurrentSession() session: AuthSession,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (file.size > this.maxFileSize) {
            throw new BadRequestException(
                `File size exceeds maximum allowed size of ${this.maxFileSize} bytes`,
            );
        }

        this.logger.log(
            `File upload request from user: ${user.id}, file: ${file.originalname}`,
        );

        return this.uploadService.uploadFile(file, user, session);
    }

    @Get()
    async getFiles(
        @Query() query: GetFilesQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        let fileIds: string[] = [];
        if (query.fileIds) {
            const idList = query.fileIds
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id.length);
            if (idList.length) {
                fileIds = idList;
            }
        }
        if (fileIds.length) {
            return this.uploadService.getFileByIds(fileIds, user.id, query);
        }
        return this.uploadService.getFiles(user.id, query);
    }

    @Get('storage/stats')
    async getStorageStats(@CurrentUser() user: AuthUser) {
        return this.uploadService.getStorageStats(user.id);
    }

    @Get(':id')
    async getFile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
        return this.uploadService.getFileById(id, user.id);
    }

    @Put(':id')
    async updateFile(
        @Param('id') id: string,
        @CurrentUser() user: AuthUser,
        @Body() body: UpdateFileDto
    ) {
        return this.uploadService.updateFile(id, body);
    }

    @Delete(':id')
    async deleteFile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
        return this.uploadService.deleteFile(id, user);
    }

    @Post('multipart/init')
    async initMultipartUpload(
        @Body() dto: InitMultipartUploadDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.uploadService.initMultipartUpload(
            dto.fileName,
            dto.fileSize,
            dto.mimeType,
            dto.chunkSize,
            user,
        );
    }

    @Post('multipart/complete')
    async completeMultipartUpload(
        @Body() dto: CompleteMultipartUploadDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.uploadService.completeMultipartUpload(
            dto.fileId,
            dto.key,
            dto.uploadId,
            dto.parts,
            dto.totalSize,
            user,
        );
    }

    @Delete('multipart/abort/:fileId')
    async abortMultipartUpload(
        @Param('fileId') fileId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.uploadService.abortMultipartUpload(fileId, user);
    }

    @Post('youtube')
    async submitYouTubeLink(
        @Body() dto: SubmitYouTubeLinkDto,
        @CurrentUser() user: AuthUser,
        @CurrentSession() session: AuthSession,
    ) {
        this.logger.log(`YouTube link submission from user: ${user.id}, URL: ${dto.url}`);
        return this.uploadService.submitYouTubeLink(dto.url, user, session);
    }

    @Get('health')
    health() {
        return { status: 'ok', service: 'upload-manager' };
    }
}

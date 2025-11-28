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
    ParseFilePipe,
    MaxFileSizeValidator,
    Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GetFilesQueryDto } from './dto/get-files-query.dto';
import { ConfigService } from '@nestjs/config';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
    private readonly logger = new Logger(UploadController.name);
    private readonly maxFileSize: number;

    constructor(
        private readonly uploadService: UploadService,
        private readonly configService: ConfigService,
    ) {
        this.maxFileSize =
            this.configService.get<number>('upload.maxFileSize') || 524288000;
    }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 524288000 }), // 500MB
                ],
                fileIsRequired: true,
            }),
        )
        file: Express.Multer.File,
        @CurrentUser() user: AuthUser,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        this.logger.log(
            `File upload request from user: ${user.id}, file: ${file.originalname}`,
        );
        return this.uploadService.uploadFile(file, user.id);
    }

    @Get()
    async getFiles(
        @Query() query: GetFilesQueryDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.uploadService.getFiles(user.id, query);
    }

    @Get(':id')
    async getFile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
        return this.uploadService.getFileById(id, user.id);
    }

    @Delete(':id')
    async deleteFile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
        return this.uploadService.deleteFile(id, user.id);
    }

    @Get('health')
    health() {
        return { status: 'ok', service: 'upload-manager' };
    }
}

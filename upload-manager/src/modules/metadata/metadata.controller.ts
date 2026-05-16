import {
    Controller,
    Post,
    Get,
    Put,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    Logger,
} from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { CreateFileMetadataDto, UpdateFileMetadataDto, BatchUpsertFileMetadataDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('metadata')
@UseGuards(JwtAuthGuard)
export class MetadataController {
    private readonly logger = new Logger(MetadataController.name);
    constructor(private readonly metadataService: MetadataService) { }

    @Post()
    async createMetadata(@Body() dto: CreateFileMetadataDto) {
        this.logger.log(`Creating metadata for file: ${dto.fileId}`);
        return this.metadataService.createMetadata(dto);
    }

    @Post('upsert')
    async upsertMetadata(@Body() dto: CreateFileMetadataDto) {
        this.logger.log(`Upserting metadata for file: ${dto.fileId}`);
        return this.metadataService.upsertMetadata(dto);
    }

    @Post('upsert-batch')
    async upsertMetadataBatch(@Body() dto: BatchUpsertFileMetadataDto) {
        this.logger.log(`Batch upserting ${dto.items.length} metadata records`);
        return this.metadataService.upsertMetadataBatch(dto.items);
    }

    @Get(':id')
    async getMetadataById(@Param('id') id: string) {
        return this.metadataService.getMetadataById(id);
    }

    @Get('file/:fileId')
    async getMetadataByFileId(@Param('fileId') fileId: string) {
        return this.metadataService.getMetadataByFileId(fileId);
    }

    @Get('batch/files')
    async getMetadataByFileIds(@Query('fileIds') fileIds: string) {
        const ids = fileIds ? fileIds.split(',').map(id => id.trim()).filter(id => id) : [];
        return this.metadataService.getMetadataByFileIds(ids);
    }

    @Get('batch/scenes')
    async getMetadataBySceneIds(@Query('sceneIds') sceneIds: string) {
        const ids = sceneIds ? sceneIds.split(',').map(id => id.trim()).filter(id => id) : [];
        return this.metadataService.getMetadataBySceneIds(ids);
    }

    @Get('scene/:sceneId')
    async getMetadataBySceneId(@Param('sceneId') sceneId: string) {
        return this.metadataService.getMetadataBySceneId(sceneId);
    }

    @Get('file/:fileId/scene')
    async getMetadataByFileAndScene(
        @Param('fileId') fileId: string,
        @Query('sceneId') sceneId?: string,
    ) {
        return this.metadataService.getMetadataByFileAndScene(fileId, sceneId);
    }

    @Put(':id')
    async updateMetadata(
        @Param('id') id: string,
        @Body() dto: UpdateFileMetadataDto,
    ) {
        return this.metadataService.updateMetadata(id, dto);
    }

    @Delete(':id')
    async deleteMetadata(@Param('id') id: string) {
        return this.metadataService.deleteMetadata(id);
    }

    @Delete('file/:fileId')
    async deleteMetadataByFileId(@Param('fileId') fileId: string) {
        return this.metadataService.deleteMetadataByFileId(fileId);
    }
}

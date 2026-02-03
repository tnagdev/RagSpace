import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
} from '@nestjs/common';
import { CollectionService } from '../services/collection.service';
import {
    CreateCollectionDto,
    UpdateCollectionDto,
    AddFilesToCollectionDto,
    RemoveFilesFromCollectionDto,
    DeleteCollectionDto,
} from '../dto/collection.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionController {
    constructor(private readonly collectionService: CollectionService) { }

    @Post()
    async create(
        @CurrentUser() user: AuthUser,
        @Body() createCollectionDto: CreateCollectionDto,
    ) {
        return this.collectionService.create(user.id, createCollectionDto);
    }

    @Get()
    async findAll(
        @CurrentUser() user: AuthUser,
        @Query('parentId') parentId?: string,
    ) {
        return this.collectionService.findAll(user.id, parentId);
    }

    @Get('flat')
    async findAllFlat(
        @CurrentUser() user: { id: string },
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 100;
        return this.collectionService.findAllFlat(user.id, pageNum, limitNum);
    }

    @Get(':id')
    async findOne(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 12;
        return this.collectionService.findOne(user.id, collectionId, pageNum, limitNum);
    }

    @Get(':id/files')
    async getCollectionFiles(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
    ) {
        return this.collectionService.getCollectionFiles(user.id, collectionId);
    }

    @Patch(':id')
    async update(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
        @Body() updateCollectionDto: UpdateCollectionDto,
    ) {
        return this.collectionService.update(
            user.id,
            collectionId,
            updateCollectionDto,
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async delete(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
        @Query() deleteCollectionDto: DeleteCollectionDto,
    ) {
        return this.collectionService.delete(
            user,
            collectionId,
            deleteCollectionDto.deleteFiles,
        );
    }

    @Post(':id/files')
    async addFiles(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
        @Body() addFilesDto: AddFilesToCollectionDto,
    ) {
        return this.collectionService.addFiles(user.id, collectionId, addFilesDto);
    }

    @Delete(':id/files')
    @HttpCode(HttpStatus.OK)
    async removeFiles(
        @CurrentUser() user: AuthUser,
        @Param('id') collectionId: string,
        @Body() removeFilesDto: RemoveFilesFromCollectionDto,
    ) {
        return this.collectionService.removeFiles(
            user.id,
            collectionId,
            removeFilesDto,
        );
    }
}

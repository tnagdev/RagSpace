import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import type { ValidatedRequest } from '../http/openapi-validator';
import { Api, IdempotencyKey, location } from '../http/request';
import * as map from '../mappers';
import { FILES } from '../rpc/clients';
import type { FilesClient } from '../rpc/clients';

interface CompletedPart {
    partNumber: number;
    etag: string;
}

@Controller()
export class FilesController {
    constructor(@Inject(FILES) private readonly files: FilesClient) {}

    @Post('uploads')
    async createUpload(
        @CurrentUser() user: SessionUser,
        @Body() body: { fileName: string; sizeBytes: number; mimeType: string },
        @IdempotencyKey() requestId: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const response = await this.files.createUpload({ userId: user.id, ...body, requestId });
        location(res, `/files/${response.file?.id}`);
        res.status(201);
        return map.upload(response);
    }

    @Post('uploads/:fileId/complete')
    @HttpCode(200)
    async completeUpload(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest, @Body() body: { parts: CompletedPart[] }) {
        const response = await this.files.completeUpload({ userId: user.id, fileId: api.params.fileId, parts: body.parts });
        return map.file(response.file);
    }

    @Delete('uploads/:fileId')
    @HttpCode(204)
    async abortUpload(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        await this.files.abortUpload({ userId: user.id, fileId: api.params.fileId });
    }

    @Get('files')
    async list(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const q = api.query as Record<string, any>;
        const response = await this.files.listFiles({
            userId: user.id,
            pageSize: q.limit ?? 0,
            pageToken: q.cursor ?? '',
            type: q.type ? map.toFileType(q.type) : undefined,
            uploadStatus: q.uploadStatus ? map.toUploadStatus(q.uploadStatus) : undefined,
            processingStatus: q.processingStatus ? map.toProcessingStatus(q.processingStatus) : undefined,
            processingStage: q.processingStage ? map.toProcessingStage(q.processingStage) : undefined,
            collectionId: q.collectionId,
            fileIds: q.ids ?? [],
            includeUrls: true,
        });
        // Download URLs are only handed out for a single file.
        return map.page(
            response.files.map((file) => ({ ...map.file(file), downloadUrl: null })),
            response.nextPageToken,
        );
    }

    @Post('files')
    async importFile(
        @CurrentUser() user: SessionUser,
        @Body() body: { url: string },
        @IdempotencyKey() requestId: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const response = await this.files.importFile({ userId: user.id, url: body.url, requestId });
        location(res, `/files/${response.file?.id}`);
        res.status(201);
        return map.file(response.file);
    }

    @Get('files/:fileId')
    async get(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.files.getFile({ userId: user.id, fileId: api.params.fileId, includeUrls: true });
        return map.file(response.file);
    }

    @Patch('files/:fileId')
    async rename(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest, @Body() body: { name: string }) {
        const response = await this.files.renameFile({ userId: user.id, fileId: api.params.fileId, name: body.name });
        return map.file(response.file);
    }

    @Delete('files/:fileId')
    @HttpCode(204)
    async remove(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        await this.files.deleteFile({ userId: user.id, fileId: api.params.fileId });
    }

    @Post('files/:fileId/reprocess')
    @HttpCode(202)
    async reprocess(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.files.reprocessFile({ userId: user.id, fileId: api.params.fileId });
        return map.file(response.file);
    }
}

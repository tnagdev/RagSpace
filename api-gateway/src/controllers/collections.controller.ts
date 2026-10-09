import { Body, Controller, Delete, Get, Inject, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { collectionsV1 } from '@ragspace/shared-ts';
import { CurrentUser } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import type { ValidatedRequest } from '../http/openapi-validator';
import { Api, IdempotencyKey, location } from '../http/request';
import * as map from '../mappers';
import { COLLECTIONS } from '../rpc/clients';
import type { CollectionsClient } from '../rpc/clients';

interface CreateCollectionBody {
    name: string;
    description?: string;
    color?: string;
    parentId?: string;
}

interface UpdateCollectionBody {
    name?: string;
    description?: string | null;
    color?: string | null;
    parentId?: string | null;
}

const TOP_LEVEL = 'root';

@Controller('collections')
export class CollectionsController {
    constructor(@Inject(COLLECTIONS) private readonly collections: CollectionsClient) {}

    @Get()
    async list(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const q = api.query as Record<string, any>;
        let parentFilter: collectionsV1.ListCollectionsRequest['parentFilter'];
        if (q.parentId === TOP_LEVEL) parentFilter = { $case: 'topLevelOnly', topLevelOnly: true };
        else if (q.parentId) parentFilter = { $case: 'parentId', parentId: q.parentId };
        const response = await this.collections.listCollections({
            userId: user.id,
            pageSize: q.limit ?? 0,
            pageToken: q.cursor ?? '',
            parentFilter,
        });
        return map.page(response.collections.map(map.collection), response.nextPageToken);
    }

    @Post()
    async create(
        @CurrentUser() user: SessionUser,
        @Body() body: CreateCollectionBody,
        @IdempotencyKey() requestId: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const response = await this.collections.createCollection({ userId: user.id, ...body, requestId });
        location(res, `/collections/${response.collection?.id}`);
        res.status(201);
        return map.collection(response.collection);
    }

    @Get(':collectionId')
    async get(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.collections.getCollection({ userId: user.id, collectionId: api.params.collectionId });
        return map.collection(response.collection);
    }

    // JSON Merge Patch: null clears a field, and a null parent moves the collection to the top level.
    @Patch(':collectionId')
    async update(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest, @Body() body: UpdateCollectionBody) {
        const response = await this.collections.updateCollection({
            userId: user.id,
            collectionId: api.params.collectionId,
            name: body.name,
            description: body.description === null ? '' : body.description,
            color: body.color === null ? '' : body.color,
            parentId: body.parentId ?? undefined,
            moveToTopLevel: body.parentId === null,
        });
        return map.collection(response.collection);
    }

    @Delete(':collectionId')
    async remove(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.collections.deleteCollection({
            userId: user.id,
            collectionId: api.params.collectionId,
            deleteFiles: Boolean(api.query.deleteFiles),
        });
        return { deletedCollections: response.deletedCollectionCount, deletedFiles: response.deletedFileCount };
    }

    @Get(':collectionId/items')
    async items(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const q = api.query as Record<string, any>;
        const response = await this.collections.listCollectionItems({
            userId: user.id,
            collectionId: api.params.collectionId,
            pageSize: q.limit ?? 0,
            pageToken: q.cursor ?? '',
        });
        return map.page(response.items.map(map.collectionItem), response.nextPageToken);
    }

    @Post(':collectionId/files')
    async addFiles(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest, @Body() body: { fileIds: string[] }) {
        const response = await this.collections.addCollectionFiles({
            userId: user.id,
            collectionId: api.params.collectionId,
            fileIds: body.fileIds,
        });
        return map.collection(response.collection);
    }

    @Delete(':collectionId/files')
    async removeFiles(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.collections.removeCollectionFiles({
            userId: user.id,
            collectionId: api.params.collectionId,
            fileIds: api.query.ids as string[],
        });
        return map.collection(response.collection);
    }
}

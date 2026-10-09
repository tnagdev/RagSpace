import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import type { searchV1 } from '@ragspace/shared-ts';
import { CurrentUser } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import * as map from '../mappers';
import { COLLECTIONS, SEARCH } from '../rpc/clients';
import type { CollectionsClient, SearchClient } from '../rpc/clients';

// SearchService caps its file filter; past that a collection search covers its first files only.
const MAX_SCOPE_FILES = 1000;

interface SearchBody {
    query: string;
    fileIds?: string[];
    collectionId?: string;
    types?: string[];
    limit?: number;
    tuning?: searchV1.SearchTuning;
}

@Controller('search')
export class SearchController {
    constructor(
        @Inject(SEARCH) private readonly search: SearchClient,
        @Inject(COLLECTIONS) private readonly collections: CollectionsClient,
    ) {}

    @Post()
    @HttpCode(200)
    async run(@CurrentUser() user: SessionUser, @Body() body: SearchBody) {
        let fileIds = body.fileIds ?? [];
        if (body.collectionId) {
            const resolved = await this.collections.resolveCollectionFileIds({
                userId: user.id,
                collectionId: body.collectionId,
                recursive: true,
            });
            if (!resolved.fileIds.length) return { items: [] };
            fileIds = resolved.fileIds.slice(0, MAX_SCOPE_FILES);
        }
        const response = await this.search.search({
            userId: user.id,
            query: body.query,
            fileIds,
            fileTypes: (body.types ?? []).map(map.toFileType),
            limit: body.limit ?? 10,
            tuning: body.tuning,
        });
        return { items: response.hits.map(map.hit) };
    }
}

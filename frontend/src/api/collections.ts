import { api, idempotencyKey, unwrap } from './client';
import type { Collection, CollectionItem, Page } from './types';

export interface CollectionInput {
    name?: string;
    description?: string | null;
    color?: string | null;
    parentId?: string | null;
}

// Enough for any realistic folder tree; each page holds 100.
const MAX_TREE_PAGES = 20;

export const collectionsAPI = {
    listAll: async (): Promise<Collection[]> => {
        const all: Collection[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_TREE_PAGES; page++) {
            const result = await unwrap(api.GET('/collections', { params: { query: { limit: 100, cursor } } }));
            all.push(...result.items);
            if (!result.nextCursor) break;
            cursor = result.nextCursor;
        }
        return all;
    },
    get: (collectionId: string) => unwrap(api.GET('/collections/{collectionId}', { params: { path: { collectionId } } })),
    items: (collectionId: string, cursor?: string): Promise<Page<CollectionItem>> =>
        unwrap(api.GET('/collections/{collectionId}/items', { params: { path: { collectionId }, query: { limit: 50, cursor } } })),
    create: (body: { name: string; description?: string; color?: string; parentId?: string }) =>
        unwrap(api.POST('/collections', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body })),
    update: (collectionId: string, body: CollectionInput) =>
        unwrap(api.PATCH('/collections/{collectionId}', { params: { path: { collectionId } }, body })),
    remove: (collectionId: string, deleteFiles = false) =>
        unwrap(api.DELETE('/collections/{collectionId}', { params: { path: { collectionId }, query: { deleteFiles } } })),
    addFiles: (collectionId: string, fileIds: string[]) =>
        unwrap(api.POST('/collections/{collectionId}/files', { params: { path: { collectionId } }, body: { fileIds } })),
    // Direct members only, capped at what one chat message may reference.
    fileIds: async (collectionId: string): Promise<string[]> =>
        (await unwrap(api.GET('/files', { params: { query: { collectionId, limit: 100 } } }))).items.map((f) => f.id),
    removeFiles: (collectionId: string, fileIds: string[]) =>
        unwrap(api.DELETE('/collections/{collectionId}/files', { params: { path: { collectionId }, query: { ids: fileIds } } })),
};

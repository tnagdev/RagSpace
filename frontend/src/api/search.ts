import type { paths } from './schema';
import { api, unwrap } from './client';
import type { SearchHit } from './types';

export type SearchRequest = paths['/search']['post']['requestBody']['content']['application/json'];

export interface ScopedSearch {
    query: string;
    fileIds?: string[];
    collectionIds?: string[];
    limit?: number;
}

const hitKey = (hit: SearchHit) => `${hit.fileId}:${hit.sceneId ?? ''}:${hit.startSeconds ?? ''}`;

export const searchAPI = {
    search: async (body: SearchRequest) => (await unwrap(api.POST('/search', { body }))).items,

    // The API takes one scope per request (files or a collection); several scopes are searched separately and merged.
    searchScoped: async ({ query, fileIds = [], collectionIds = [], limit = 20 }: ScopedSearch): Promise<SearchHit[]> => {
        const requests: SearchRequest[] = collectionIds.map((collectionId) => ({ query, collectionId, limit }));
        if (fileIds.length || !requests.length) requests.push({ query, limit, ...(fileIds.length ? { fileIds } : {}) });
        const batches = await Promise.all(requests.map(searchAPI.search));
        const unique = new Map<string, SearchHit>();
        for (const hit of batches.flat()) {
            const existing = unique.get(hitKey(hit));
            if (!existing || existing.score < hit.score) unique.set(hitKey(hit), hit);
        }
        return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    },
};

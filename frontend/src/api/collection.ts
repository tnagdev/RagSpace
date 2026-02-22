import { privateAxios } from './apiClient';
import type {
    Collection,
    CollectionWithItems,
    CreateCollectionDto,
    UpdateCollectionDto,
    AddFilesToCollectionDto,
    RemoveFilesFromCollectionDto,
    DeleteCollectionResponse,
} from '@/types/collection.types';

const COLLECTION_BASE = '/api/collections';

export const collectionAPI = {
    getCollections: async (parentId?: string | null): Promise<Collection[]> => {
        const response = await privateAxios.get<Collection[]>(COLLECTION_BASE, {
            params: parentId !== undefined ? { parentId: parentId || 'root' } : {},
        });
        return response.data;
    },

    getCollectionsFlat: async (page: number = 1, limit: number = 100): Promise<{
        collections: Collection[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
    }> => {
        const response = await privateAxios.get(`${COLLECTION_BASE}/flat`, {
            params: { page, limit },
        });
        return response.data;
    },

    getCollection: async (collectionId: string, page?: number, limit?: number): Promise<CollectionWithItems> => {
        const response = await privateAxios.get<CollectionWithItems>(
            `${COLLECTION_BASE}/${collectionId}`,
            { params: { page, limit } }
        );
        return response.data;
    },

    createCollection: async (
        data: CreateCollectionDto,
    ): Promise<Collection> => {
        const response = await privateAxios.post<Collection>(
            COLLECTION_BASE,
            data,
        );
        return response.data;
    },

    updateCollection: async (
        collectionId: string,
        data: UpdateCollectionDto,
    ): Promise<Collection> => {
        const response = await privateAxios.patch<Collection>(
            `${COLLECTION_BASE}/${collectionId}`,
            data,
        );
        return response.data;
    },

    deleteCollection: async (
        collectionId: string,
        deleteFiles: boolean = false,
    ): Promise<DeleteCollectionResponse> => {
        const response = await privateAxios.delete<DeleteCollectionResponse>(
            `${COLLECTION_BASE}/${collectionId}`,
            {
                params: { deleteFiles },
            },
        );
        return response.data;
    },

    addFilesToCollection: async (
        collectionId: string,
        data: AddFilesToCollectionDto,
    ): Promise<Collection> => {
        const response = await privateAxios.post<Collection>(
            `${COLLECTION_BASE}/${collectionId}/files`,
            data,
        );
        return response.data;
    },

    removeFilesFromCollection: async (
        collectionId: string,
        data: RemoveFilesFromCollectionDto,
    ): Promise<Collection> => {
        const response = await privateAxios.delete<Collection>(
            `${COLLECTION_BASE}/${collectionId}/files`,
            {
                data,
            },
        );
        return response.data;
    },

    getCollectionFiles: async (collectionId: string): Promise<string[]> => {
        const response = await privateAxios.get<string[]>(
            `${COLLECTION_BASE}/${collectionId}/files`,
        );
        return response.data;
    },
};

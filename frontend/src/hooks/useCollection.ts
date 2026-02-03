import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { collectionAPI } from '@/api/collection';
import type {
    Collection,
    CollectionWithItems,
    CreateCollectionDto,
    UpdateCollectionDto,
    AddFilesToCollectionDto,
    RemoveFilesFromCollectionDto,
    DeleteCollectionResponse,
} from '@/types/collection.types';
import { uploadKeys } from './useUpload';

export const collectionKeys = {
    all: ['collections'] as const,
    lists: () => [...collectionKeys.all, 'list'] as const,
    list: (parentId?: string | null) => [...collectionKeys.lists(), parentId] as const,
    flat: () => [...collectionKeys.all, 'flat'] as const,
    details: () => [...collectionKeys.all, 'detail'] as const,
    detail: (id: string, page?: number, limit?: number) => [...collectionKeys.details(), id, page, limit] as const,
};

export const useCollections = (
    parentId?: string | null,
    options?: Omit<UseQueryOptions<Collection[], Error>, 'queryKey' | 'queryFn'>,
) => {
    return useQuery({
        queryKey: collectionKeys.list(parentId),
        queryFn: () => collectionAPI.getCollections(parentId),
        ...options,
    });
};

export const useCollectionsFlat = (
    options?: Omit<UseQueryOptions<{
        collections: Collection[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
    }, Error>, 'queryKey' | 'queryFn'>,
) => {
    return useQuery({
        queryKey: collectionKeys.flat(),
        queryFn: () => collectionAPI.getCollectionsFlat(),
        ...options,
    });
};

export const useCollection = (
    collectionId: string,
    page?: number,
    limit?: number,
    options?: Omit<UseQueryOptions<CollectionWithItems, Error>, 'queryKey' | 'queryFn'>,
) => {
    return useQuery({
        queryKey: collectionKeys.detail(collectionId, page, limit),
        queryFn: () => collectionAPI.getCollection(collectionId, page, limit),
        ...options,
        enabled: options?.enabled !== undefined ? options.enabled : !!collectionId,
    });
};

export const useCreateCollection = (
    options?: UseMutationOptions<Collection, Error, CreateCollectionDto>,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateCollectionDto) =>
            collectionAPI.createCollection(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: collectionKeys.lists() });
        },
        ...options,
    });
};

export const useUpdateCollection = (
    options?: UseMutationOptions<
        Collection,
        Error,
        { collectionId: string; data: UpdateCollectionDto }
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ collectionId, data }) =>
            collectionAPI.updateCollection(collectionId, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: collectionKeys.lists() });
            queryClient.invalidateQueries({
                queryKey: collectionKeys.detail(data.id),
            });
        },
        ...options,
    });
};

export const useDeleteCollection = (
    options?: UseMutationOptions<
        DeleteCollectionResponse,
        Error,
        { collectionId: string; deleteFiles?: boolean }
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ collectionId, deleteFiles }) =>
            collectionAPI.deleteCollection(collectionId, deleteFiles),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: collectionKeys.lists() });
            queryClient.removeQueries({
                queryKey: collectionKeys.detail(variables.collectionId),
            });
            if (variables.deleteFiles) {
                queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
            }
        },
        ...options,
    });
};

export const useAddFilesToCollection = (
    options?: UseMutationOptions<
        Collection,
        Error,
        { collectionId: string; data: AddFilesToCollectionDto }
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ collectionId, data }) =>
            collectionAPI.addFilesToCollection(collectionId, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({
                queryKey: collectionKeys.detail(data.id),
            });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};

export const useRemoveFilesFromCollection = (
    options?: UseMutationOptions<
        Collection,
        Error,
        { collectionId: string; data: RemoveFilesFromCollectionDto }
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ collectionId, data }) =>
            collectionAPI.removeFilesFromCollection(collectionId, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({
                queryKey: collectionKeys.detail(data.id),
            });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};

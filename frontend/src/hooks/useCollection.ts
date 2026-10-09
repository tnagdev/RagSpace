import { type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CollectionInput, collectionsAPI } from '@/api/collections';
import type { Collection } from '@/api/types';
import { uploadKeys } from './useUpload';

export interface CollectionNode extends Collection {
    children: CollectionNode[];
}

export const collectionKeys = {
    all: ['collections'] as const,
    tree: () => [...collectionKeys.all, 'tree'] as const,
    details: () => [...collectionKeys.all, 'detail'] as const,
    detail: (id: string) => [...collectionKeys.details(), id] as const,
    items: (id: string) => [...collectionKeys.all, 'items', id] as const,
};

export function buildTree(collections: Collection[]): CollectionNode[] {
    const nodes = new Map(collections.map((c) => [c.id, { ...c, children: [] as CollectionNode[] }]));
    const roots: CollectionNode[] = [];
    for (const node of nodes.values()) {
        const parent = node.parentId ? nodes.get(node.parentId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    const sort = (list: CollectionNode[]) => {
        list.sort((a, b) => a.name.localeCompare(b.name));
        list.forEach((n) => sort(n.children));
    };
    sort(roots);
    return roots;
}

function refreshCollections(queryClient: QueryClient, collectionId?: string) {
    queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
    if (collectionId) {
        queryClient.invalidateQueries({ queryKey: collectionKeys.detail(collectionId) });
        queryClient.invalidateQueries({ queryKey: collectionKeys.items(collectionId) });
    }
}

// Every collection, flat; derive the tree with buildTree.
export const useCollections = () => useQuery({ queryKey: collectionKeys.tree(), queryFn: collectionsAPI.listAll });

export const useCollection = (collectionId: string) =>
    useQuery({
        queryKey: collectionKeys.detail(collectionId),
        queryFn: () => collectionsAPI.get(collectionId),
        enabled: !!collectionId,
    });

export const useCollectionItems = (collectionId: string) =>
    useInfiniteQuery({
        queryKey: collectionKeys.items(collectionId),
        queryFn: ({ pageParam }) => collectionsAPI.items(collectionId, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled: !!collectionId,
    });

export const useCreateCollection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: { name: string; description?: string; color?: string; parentId?: string }) =>
            collectionsAPI.create(body),
        onSuccess: (collection) => refreshCollections(queryClient, collection.parentId ?? undefined),
    });
};

export const useUpdateCollection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ collectionId, data }: { collectionId: string; data: CollectionInput }) =>
            collectionsAPI.update(collectionId, data),
        onSuccess: (collection) => refreshCollections(queryClient, collection.id),
    });
};

export const useDeleteCollection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ collectionId, deleteFiles }: { collectionId: string; deleteFiles?: boolean }) =>
            collectionsAPI.remove(collectionId, deleteFiles),
        onSuccess: (_result, { collectionId, deleteFiles }) => {
            queryClient.removeQueries({ queryKey: collectionKeys.detail(collectionId) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.all });
            if (deleteFiles) queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
    });
};

export const useAddFilesToCollection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ collectionId, fileIds }: { collectionId: string; fileIds: string[] }) =>
            collectionsAPI.addFiles(collectionId, fileIds),
        onSuccess: (collection) => refreshCollections(queryClient, collection.id),
    });
};

export const useRemoveFilesFromCollection = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ collectionId, fileIds }: { collectionId: string; fileIds: string[] }) =>
            collectionsAPI.removeFiles(collectionId, fileIds),
        onSuccess: (collection) => refreshCollections(queryClient, collection.id),
    });
};

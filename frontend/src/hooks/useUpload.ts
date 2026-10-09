import {
    type InfiniteData,
    type QueryClient,
    type UseQueryOptions,
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { type FileListQuery, type UploadCallbacks, filesAPI } from '@/api/files';
import type { ApiFile, FileState, Page } from '@/api/types';
import { usageKeys } from './usePayment';

export const uploadKeys = {
    all: ['files'] as const,
    lists: () => [...uploadKeys.all, 'list'] as const,
    list: (query?: FileListQuery) => [...uploadKeys.lists(), query] as const,
    infinite: (query?: FileListQuery) => [...uploadKeys.lists(), 'infinite', query] as const,
    details: () => [...uploadKeys.all, 'detail'] as const,
    detail: (id: string) => [...uploadKeys.details(), id] as const,
};

function invalidateLibrary(queryClient: QueryClient) {
    queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
    queryClient.invalidateQueries({ queryKey: usageKeys.all });
}

// Applies a live FileState update to every cached copy of that file.
export function patchCachedFile(queryClient: QueryClient, state: FileState) {
    const { progressPercent: _progress, ...fields } = state;
    const patch = (file: ApiFile) => (file.id === state.id ? { ...file, ...fields } : file);
    queryClient.setQueryData<ApiFile>(uploadKeys.detail(state.id), (old) => (old ? patch(old) : old));
    queryClient.setQueriesData<Page<ApiFile> | InfiniteData<Page<ApiFile>>>({ queryKey: uploadKeys.lists() }, (old) => {
        if (!old) return old;
        if ('pages' in old) return { ...old, pages: old.pages.map((page) => ({ ...page, items: page.items.map(patch) })) };
        return { ...old, items: old.items.map(patch) };
    });
}

export const useFiles = (
    query: FileListQuery = {},
    options?: Omit<UseQueryOptions<Page<ApiFile>, Error>, 'queryKey' | 'queryFn'>,
) =>
    useQuery({
        queryKey: uploadKeys.list(query),
        queryFn: () => filesAPI.list(query),
        ...options,
    });

export const useInfiniteFiles = (query: Omit<FileListQuery, 'cursor'> = {}) =>
    useInfiniteQuery({
        queryKey: uploadKeys.infinite(query),
        queryFn: ({ pageParam }) => filesAPI.list({ ...query, cursor: pageParam }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

export const useFile = (id: string, options?: Omit<UseQueryOptions<ApiFile, Error>, 'queryKey' | 'queryFn'>) =>
    useQuery({
        queryKey: uploadKeys.detail(id),
        queryFn: () => filesAPI.get(id),
        enabled: !!id,
        ...options,
    });

export const useUploadFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, ...callbacks }: { file: File } & UploadCallbacks) => filesAPI.upload(file, callbacks),
        onSuccess: () => invalidateLibrary(queryClient),
    });
};

export const useUpdateFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => filesAPI.rename(id, name),
        onSuccess: (file) => {
            queryClient.setQueryData(uploadKeys.detail(file.id), file);
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
    });
};

export const useDeleteFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => filesAPI.remove(id),
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: uploadKeys.detail(id) });
            invalidateLibrary(queryClient);
        },
    });
};

export const useAbortUpload = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => filesAPI.abortUpload(id),
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: uploadKeys.detail(id) });
            invalidateLibrary(queryClient);
        },
    });
};

export const useSubmitYouTubeLink = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (url: string) => filesAPI.importFromUrl(url),
        onSuccess: () => invalidateLibrary(queryClient),
    });
};

export const useReprocessFile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => filesAPI.reprocess(id),
        onSuccess: (file) => {
            queryClient.setQueryData(uploadKeys.detail(file.id), file);
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
    });
};

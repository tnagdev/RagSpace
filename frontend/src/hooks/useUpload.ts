import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { uploadAPI } from '@/api/upload';
import type {
    FileResponseDto,
    FileListResponseDto,
    GetFilesQueryDto,
    UpdateFileDto,
    StorageStatsDto,
} from '@/types/upload.types';


export const uploadKeys = {
    all: ['uploads'] as const,
    lists: () => [...uploadKeys.all, 'list'] as const,
    list: (query?: GetFilesQueryDto) => [...uploadKeys.lists(), query] as const,
    details: () => [...uploadKeys.all, 'detail'] as const,
    detail: (id: string) => [...uploadKeys.details(), id] as const,
    mutations: () => [...uploadKeys.all, 'mutation'] as const,
    mutation: (fileId: string) => [...uploadKeys.mutations(), fileId] as const,
    storage: () => [...uploadKeys.all, 'storage'] as const,
};

interface UploadFileParams {
    file: File;
    onProgress?: (fileRecord: FileResponseDto, progress: number) => void;
    onInit?: (fileRecord: FileResponseDto) => void;
    onComplete?: (fileRecord: FileResponseDto) => void;
    onError?: (error: Error, fileRecord?: FileResponseDto) => void;
}

export const useUploadFile = (
    options?: Omit<UseMutationOptions<FileResponseDto, Error, UploadFileParams>, 'mutationFn' | 'mutationKey'>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ file, onProgress, onInit, onComplete, onError }: UploadFileParams) => {
            const result = await uploadAPI.uploadFile(file, onProgress, onInit, onComplete, onError);
            return result;
        },
        mutationKey: uploadKeys.mutations(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
            queryClient.invalidateQueries({ queryKey: uploadKeys.storage() });
        },
        ...options,
    });
};


export const useFiles = (
    query?: GetFilesQueryDto,
    options?: Omit<UseQueryOptions<FileListResponseDto, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: uploadKeys.list(query),
        queryFn: () => uploadAPI.getFiles(query),
        ...options,
    });
};

export const useFile = (
    id: string,
    options?: Omit<UseQueryOptions<FileResponseDto, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: uploadKeys.detail(id),
        queryFn: () => uploadAPI.getFileById(id),
        enabled: !!id,
        ...options,
    });
};


export const useUpdateFile = (
    options?: UseMutationOptions<FileResponseDto, Error, { id: string; data: UpdateFileDto }>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => uploadAPI.updateFile(id, data),
        onSuccess: (data, variables) => {
            queryClient.setQueryData(uploadKeys.detail(variables.id), data);
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};


export const useDeleteFile = (
    options?: UseMutationOptions<void, Error, string>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => uploadAPI.deleteFile(id),
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({ queryKey: uploadKeys.detail(variables) });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
            queryClient.invalidateQueries({ queryKey: uploadKeys.storage() });
        },
        ...options,
    });
};


export const useAbortMultipartUpload = (
    options?: UseMutationOptions<void, Error, string>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (fileId: string) => uploadAPI.abortMultipartUpload(fileId),
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({ queryKey: uploadKeys.detail(variables) });
            queryClient.removeQueries({ queryKey: uploadKeys.mutations() });
            queryClient.invalidateQueries({ queryKey: uploadKeys.storage() });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};


export const useFilePolling = (
    id: string,
    options?: {
        interval?: number;
        enabled?: boolean;
        onComplete?: (file: FileResponseDto) => void;
    }
) => {
    const { interval = 2000, enabled = true, onComplete } = options || {};
    return useQuery({
        queryKey: uploadKeys.detail(id),
        queryFn: () => uploadAPI.getFileById(id),
        enabled: enabled && !!id,
        refetchInterval: (query) => {
            const data = query.state.data;
            if (data?.processingStage === 'COMPLETED') {
                onComplete?.(data);
                return false;
            }
            return interval;
        },
        refetchIntervalInBackground: true,
    });
};
export const useStorageStats = (
    options?: Omit<UseQueryOptions<StorageStatsDto, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: uploadKeys.storage(),
        queryFn: () => uploadAPI.getStorageStats(),
        staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
        ...options,
    });
};

export const useSubmitYouTubeLink = (
    options?: UseMutationOptions<FileResponseDto, Error, string>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (url: string) => uploadAPI.submitYouTubeLink(url),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};

export const useReprocessFile = (
    options?: UseMutationOptions<{ message: string; fileId: string }, Error, string>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => uploadAPI.reprocessFile(id),
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: uploadKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};
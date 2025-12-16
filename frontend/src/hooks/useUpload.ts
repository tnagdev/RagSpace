import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import { uploadAPI } from '@/api/upload';
import type {
    FileResponseDto,
    FileListResponseDto,
    GetFilesQueryDto,
    UpdateFileDto,
} from '@/types/upload.types';


export const uploadKeys = {
    all: ['uploads'] as const,
    lists: () => [...uploadKeys.all, 'list'] as const,
    list: (query?: GetFilesQueryDto) => [...uploadKeys.lists(), query] as const,
    details: () => [...uploadKeys.all, 'detail'] as const,
    detail: (id: string) => [...uploadKeys.details(), id] as const,
};

interface UploadFileParams {
    file: File;
    onProgress?: (fileRecord: FileResponseDto, progress: number) => void;
    onInit?: (fileRecord: FileResponseDto) => void;
    onComplete?: (fileRecord: FileResponseDto) => void;
    onError?: (fileRecord: FileResponseDto, error: Error) => void;
}

export const useUploadFile = (
    options?: Omit<UseMutationOptions<FileResponseDto, Error, UploadFileParams>, 'mutationFn'>
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ file, onProgress, onInit, onComplete, onError }: UploadFileParams) =>
            uploadAPI.uploadFile(file, onProgress, onInit, onComplete, onError),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
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

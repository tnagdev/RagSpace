import { privateAxios } from './apiClient';
import type {
    FileResponseDto,
    FileListResponseDto,
    GetFilesQueryDto,
    UpdateFileDto,
} from '@/types/upload.types';
import axios from 'axios';

const UPLOAD_BASE = '/api/upload';
const CHUNK_SIZE = 10 * 1024 * 1024;

interface MultipartInitResponse {
    fileId: string;
    uploadId: string;
    key: string;
    presignedUrls: string[];
    chunkSize: number;
    file: FileResponseDto;
}

interface CompletedPart {
    ETag: string;
    PartNumber: number;
}

export const uploadAPI = {
    uploadFile: async (
        file: File,
        onProgress?: (fileRecord: FileResponseDto, progress: number) => void,
        onInit?: (fileRecord: FileResponseDto) => void,
        onComplete?: (fileRecord: FileResponseDto) => void,
        onError?: (fileRecord: FileResponseDto, error: Error) => void
    ): Promise<FileResponseDto> => {
        if (file.size > CHUNK_SIZE) {
            return uploadAPI.uploadFileChunked(file, onProgress, onInit, onComplete, onError);
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await privateAxios.post<FileResponseDto>(UPLOAD_BASE, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress?.(response.data, progress);
                    }
                },
            });
            onComplete?.(response.data);
            return response.data;
        } catch (error) {
            if (error instanceof Error) {
                onError?.(null, error);
            }
            throw error;
        }
    },

    uploadFileChunked: async (
        file: File,
        onProgress?: (fileRecord: FileResponseDto, progress: number) => void,
        onInit?: (fileRecord: FileResponseDto) => void,
        onComplete?: (fileRecord: FileResponseDto) => void,
        onError?: (fileRecord: FileResponseDto, error: Error) => void
    ): Promise<FileResponseDto> => {
        let uploadedFile: FileResponseDto;
        try {
            const initResponse = await privateAxios.post<MultipartInitResponse>(
                `${UPLOAD_BASE}/multipart/init`,
                {
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    chunkSize: CHUNK_SIZE,
                }
            );
            const { fileId, uploadId, key, presignedUrls, file: fileRecord } = initResponse.data;
            const uploadedFile = fileRecord;
            if (onInit && fileRecord) {
                onInit(fileRecord);
            }

            const chunks = Math.ceil(file.size / CHUNK_SIZE);
            const completedParts: CompletedPart[] = [];
            let uploadedBytes = 0;

            for (let i = 0; i < chunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                const presignedUrl = presignedUrls[i];
                const uploadResponse = await axios.put(presignedUrl, chunk, {
                    headers: {
                        'Content-Type': file.type,
                    },
                    onUploadProgress: (progressEvent) => {
                        const chunkProgress = progressEvent.loaded || 0;
                        const totalUploaded = uploadedBytes + chunkProgress;
                        const overallProgress = Math.round((totalUploaded / file.size) * 100);
                        onProgress?.(fileRecord, overallProgress);
                    },
                });

                const etag = uploadResponse.headers['etag'] || uploadResponse.headers['ETag'];
                if (!etag) {
                    throw new Error(`Failed to get ETag for chunk ${i + 1}`);
                }

                completedParts.push({
                    ETag: etag.replace(/"/g, ''),
                    PartNumber: i + 1,
                });
                uploadedBytes += chunk.size;
            }

            const completeResponse = await privateAxios.post<FileResponseDto>(
                `${UPLOAD_BASE}/multipart/complete`,
                {
                    fileId,
                    key,
                    uploadId,
                    parts: completedParts,
                    totalSize: file.size,
                }
            );
            onComplete?.(completeResponse.data);
            return completeResponse.data;
        } catch (error) {
            console.error('Chunked upload failed:', error);
            if (error instanceof Error) {
                onError?.(uploadedFile, error);
            }
            throw error;
        }
    },

    abortMultipartUpload: async (fileId: string): Promise<void> => {
        await privateAxios.delete(`${UPLOAD_BASE}/multipart/abort/${fileId}`);
    },

    getFiles: async (query?: GetFilesQueryDto): Promise<FileListResponseDto> => {
        const response = await privateAxios.get<FileListResponseDto>(UPLOAD_BASE, {
            params: query,
        });
        return response.data;
    },

    getFileById: async (id: string): Promise<FileResponseDto> => {
        const response = await privateAxios.get<FileResponseDto>(`${UPLOAD_BASE}/${id}`);
        return response.data;
    },

    updateFile: async (id: string, data: UpdateFileDto): Promise<FileResponseDto> => {
        const response = await privateAxios.put<FileResponseDto>(`${UPLOAD_BASE}/${id}`, data);
        return response.data;
    },

    deleteFile: async (id: string): Promise<void> => {
        await privateAxios.delete(`${UPLOAD_BASE}/${id}`);
    },
};
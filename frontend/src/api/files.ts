import type { paths } from './schema';
import { api, idempotencyKey, unwrap } from './client';
import type { ApiFile, Page } from './types';

export type FileListQuery = NonNullable<paths['/files']['get']['parameters']['query']>;

export interface UploadCallbacks {
    onCreated?: (file: ApiFile) => void;
    onProgress?: (file: ApiFile, percent: number) => void;
    signal?: AbortSignal;
}

function putPart(url: string, body: Blob, signal: AbortSignal | undefined, onProgress: (loaded: number) => void): Promise<string> {
    // XHR rather than fetch: fetch cannot report upload progress.
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.upload.onprogress = (event) => onProgress(event.loaded);
        xhr.onload = () => {
            const etag = xhr.getResponseHeader('ETag');
            if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
            else reject(new Error(`Part upload failed with status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Part upload failed'));
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
        signal?.addEventListener('abort', () => xhr.abort(), { once: true });
        xhr.send(body);
    });
}

export const filesAPI = {
    list: (query: FileListQuery = {}): Promise<Page<ApiFile>> => unwrap(api.GET('/files', { params: { query } })),
    get: (fileId: string) => unwrap(api.GET('/files/{fileId}', { params: { path: { fileId } } })),
    rename: (fileId: string, name: string) =>
        unwrap(api.PATCH('/files/{fileId}', { params: { path: { fileId } }, body: { name } })),
    remove: (fileId: string) => unwrap(api.DELETE('/files/{fileId}', { params: { path: { fileId } } })),
    reprocess: (fileId: string) => unwrap(api.POST('/files/{fileId}/reprocess', { params: { path: { fileId } } })),
    importFromUrl: (url: string) =>
        unwrap(api.POST('/files', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body: { url } })),
    abortUpload: (fileId: string) => unwrap(api.DELETE('/uploads/{fileId}', { params: { path: { fileId } } })),

    upload: async (file: File, { onCreated, onProgress, signal }: UploadCallbacks = {}): Promise<ApiFile> => {
        const upload = await unwrap(
            api.POST('/uploads', {
                params: { header: { 'Idempotency-Key': idempotencyKey() } },
                body: { fileName: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream' },
            }),
        );
        onCreated?.(upload.file);

        const parts = [];
        let uploaded = 0;
        for (const part of upload.parts) {
            const start = (part.partNumber - 1) * upload.partSizeBytes;
            const chunk = file.slice(start, Math.min(start + upload.partSizeBytes, file.size));
            const etag = await putPart(part.url, chunk, signal, (loaded) =>
                onProgress?.(upload.file, Math.round(((uploaded + loaded) / file.size) * 100)),
            );
            uploaded += chunk.size;
            parts.push({ partNumber: part.partNumber, etag });
        }
        return unwrap(api.POST('/uploads/{fileId}/complete', { params: { path: { fileId: upload.file.id } }, body: { parts } }));
    },
};

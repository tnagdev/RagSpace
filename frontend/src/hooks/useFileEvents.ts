import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadKeys } from './useUpload';
import type { FileResponseDto, FileListResponseDto } from '@/types/upload.types';

interface FileEventPayload {
    fileId: string;
    type: string;
    progress?: number;
    file?: FileResponseDto;
}

export function useFileEvents(
    onProgress?: (fileId: string, stage: string, progress: number) => void
): void {
    const queryClient = useQueryClient();

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;
        let unmounted = false;

        function connect(): void {
            if (unmounted) return;
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${location.host}/ws/upload-events`);

            ws.onopen = () => {
                attempt = 0;
            };

            ws.onmessage = (event: MessageEvent<string>) => {
                try {
                    const payload = JSON.parse(event.data) as FileEventPayload;
                    if (!payload.fileId) return;

                    // Progress-only events — no file update needed
                    if (payload.progress !== undefined && !payload.file) {
                        onProgress?.(payload.fileId, payload.type, payload.progress);
                        return;
                    }

                    if (!payload.file) return;

                    // Progress event that also carries a file snapshot
                    if (payload.progress !== undefined) {
                        onProgress?.(payload.fileId, payload.type, payload.progress);
                    }

                    queryClient.setQueryData<FileResponseDto>(
                        uploadKeys.detail(payload.fileId),
                        payload.file,
                    );

                    queryClient.setQueriesData<FileListResponseDto>(
                        { queryKey: uploadKeys.lists() },
                        (old) => {
                            if (!old) return old;
                            return {
                                ...old,
                                files: old.files.map(f =>
                                    f.id === payload.fileId ? payload.file! : f
                                ),
                            };
                        },
                    );

                    if (payload.file.processingStage === 'COMPLETED') {
                        queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
                    }
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = (event: CloseEvent) => {
                if (unmounted) return;
                // Auth/policy rejection — back off for 60 s to avoid hammering the server
                if (event.code === 1008) {
                    attempt = 0;
                    reconnectTimer = setTimeout(connect, 60_000);
                    return;
                }
                const jitter = Math.random() * 1000;
                const delay = Math.min(1_000 * 2 ** attempt + jitter, 30_000);
                attempt++;
                reconnectTimer = setTimeout(connect, delay);
            };

            ws.onerror = () => {
                ws?.close();
            };
        }

        connect();

        return () => {
            unmounted = true;
            if (reconnectTimer !== null) clearTimeout(reconnectTimer);
            ws?.close();
        };
    }, [queryClient, onProgress]);
}

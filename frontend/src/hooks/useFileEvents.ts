import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uploadKeys } from './useUpload';
import type { FileResponseDto, FileListResponseDto } from '@/types/upload.types';

interface FileEventPayload {
    fileId: string;
    type: string;
    progress?: number;
    stage?: string;
    file?: FileResponseDto;
}

interface ProcessingSnapshotFile {
    id: string;
    processingStage: string;
    uploadStatus: string;
    processingStatus?: string;
}

export function useFileEvents(
    onProgress?: (fileId: string, type: string, progress: number, stage?: string) => void,
    onSnapshot?: (files: ProcessingSnapshotFile[]) => void,
): { connected: boolean; hasConnectedOnce: boolean } {
    const queryClient = useQueryClient();
    const [connected, setConnected] = useState(false);
    // Tracks whether the WS has ever successfully connected this session.
    // Used to suppress the "Reconnecting…" banner on initial page load.
    const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
    // Keep a stable ref so the effect closure always reads the latest value
    const connectedRef = useRef(false);

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;
        let unmounted = false;

        function setConn(value: boolean) {
            connectedRef.current = value;
            setConnected(value);
        }

        function connect(): void {
            if (unmounted) return;
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${location.host}/ws/upload-events`);

            ws.onopen = () => {
                const isReconnect = attempt > 0;
                attempt = 0;
                setHasConnectedOnce(true);
                setConn(true);
                // On reconnect, refresh file list so any FAILED/COMPLETED state that arrived
                // while disconnected is fetched from DB rather than remaining stale.
                if (isReconnect) {
                    queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
                }
            };

            ws.onmessage = (event: MessageEvent<string>) => {
                try {
                    const raw = JSON.parse(event.data) as any;

                    // Handle snapshot message (no fileId, has `files` array)
                    if (raw.type === 'file.processing.snapshot') {
                        onSnapshot?.(raw.files ?? []);
                        return;
                    }

                    const payload = raw as FileEventPayload;
                    if (!payload.fileId) return;

                    // file.processing.started / file.processing.completed signal stage
                    // transitions but carry no meaningful progress value.  Only forward
                    // progress when the event explicitly sets it — defaulting to 0 would
                    // reset a bar that was already showing N% mid-stream.
                    if (payload.type === 'file.processing.started' || payload.type === 'file.processing.completed') {
                        if (payload.progress !== undefined) {
                            const stage = payload.stage ?? payload.file?.processingStage;
                            onProgress?.(payload.fileId, payload.type, payload.progress, stage);
                        }
                        // Still fall through to update React Query cache if a file snapshot is present
                        if (!payload.file) return;
                    }

                    // Progress-only events — no file update needed
                    if (payload.progress !== undefined && !payload.file) {
                        onProgress?.(payload.fileId, payload.type, payload.progress, payload.stage);
                        return;
                    }

                    if (!payload.file) return;

                    // Progress event that also carries a file snapshot.
                    // Use payload.stage (the event's stage) rather than payload.file.processingStage
                    // (the current DB stage). They can differ during simultaneous pipeline stages
                    // (e.g. SCENE_DETECTION progress arriving while DB already shows INDEXING).
                    // stage-keyed wsProgress in FilesPage isolates each stage's progress.
                    if (payload.progress !== undefined) {
                        onProgress?.(payload.fileId, payload.type, payload.progress, payload.stage ?? payload.file.processingStage);
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

            ws.onclose = () => {
                if (unmounted) return;
                setConn(false);
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
            setConn(false);
        };
    }, [queryClient, onProgress, onSnapshot]);

    return { connected, hasConnectedOnce };
}

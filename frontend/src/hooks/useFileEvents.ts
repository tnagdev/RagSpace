import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/api/client';
import type { FileState } from '@/api/types';
import { patchCachedFile, uploadKeys } from './useUpload';
import { usageKeys } from './usePayment';

type ProgressHandler = (fileId: string, progress: number, stage: string) => void;
type SnapshotHandler = (files: FileState[]) => void;
type UpdateHandler = (file: FileState) => void;

const TERMINAL = (file: FileState) =>
    file.processingStatus === 'COMPLETED' || file.processingStatus === 'FAILED' || file.uploadStatus === 'FAILED';

// One stream per tab: live processing state for the signed-in user's files.
export function useFileEvents(handlers: {
    onProgress?: ProgressHandler;
    onSnapshot?: SnapshotHandler;
    onUpdate?: UpdateHandler;
} = {}): { connected: boolean; hasConnectedOnce: boolean } {
    const queryClient = useQueryClient();
    const [connected, setConnected] = useState(false);
    const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        // EventSource reconnects on its own; every reconnect starts with a fresh snapshot.
        const source = new EventSource(`${API_BASE_URL}/events`, { withCredentials: true });
        let opened = false;

        source.onopen = () => {
            if (opened) queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
            opened = true;
            setConnected(true);
            setHasConnectedOnce(true);
        };
        source.onerror = () => setConnected(false);

        source.addEventListener('files.snapshot', (event) => {
            const { files } = JSON.parse((event as MessageEvent<string>).data) as { files: FileState[] };
            files.forEach((file) => patchCachedFile(queryClient, file));
            handlersRef.current.onSnapshot?.(files);
        });

        source.addEventListener('file.updated', (event) => {
            const { file } = JSON.parse((event as MessageEvent<string>).data) as { file: FileState };
            patchCachedFile(queryClient, file);
            if (file.progressPercent !== null) {
                handlersRef.current.onProgress?.(file.id, file.progressPercent, file.processingStage);
            }
            handlersRef.current.onUpdate?.(file);
            if (TERMINAL(file)) {
                queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
                queryClient.invalidateQueries({ queryKey: uploadKeys.detail(file.id) });
                queryClient.invalidateQueries({ queryKey: usageKeys.all });
            }
        });

        return () => {
            source.close();
            setConnected(false);
        };
    }, [queryClient]);

    return { connected, hasConnectedOnce };
}

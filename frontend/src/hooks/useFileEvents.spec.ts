/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiFile, FileState, Page } from '@/api/types';

class FakeEventSource {
    static last: FakeEventSource;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    listeners = new Map<string, (event: MessageEvent<string>) => void>();
    close = vi.fn();

    constructor(readonly url: string) {
        FakeEventSource.last = this;
    }

    addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners.set(type, listener);
    }

    emit(type: string, data: unknown) {
        this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
}

vi.stubGlobal('EventSource', FakeEventSource);

import { useFileEvents } from './useFileEvents';
import { uploadKeys } from './useUpload';

const state = (overrides: Partial<FileState> = {}): FileState => ({
    id: 'f1',
    name: 'clip.mp4',
    uploadStatus: 'COMPLETED',
    processingStatus: 'IN_PROGRESS',
    processingStage: 'SCENE_DETECTION',
    progressPercent: 40,
    errorMessage: null,
    updatedAt: '2026-10-09T00:00:00Z',
    ...overrides,
});

function setup(handlers: Parameters<typeof useFileEvents>[0] = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
    const hook = renderHook(() => useFileEvents(handlers), { wrapper });
    return { queryClient, hook, source: FakeEventSource.last };
}

describe('useFileEvents', () => {
    afterEach(() => vi.clearAllMocks());

    it('connects to the events stream and reports connection state', () => {
        const { hook, source } = setup();
        expect(source.url.endsWith('/api/v1/events')).toBe(true);
        act(() => source.onopen?.());
        expect(hook.result.current).toEqual({ connected: true, hasConnectedOnce: true });
        act(() => source.onerror?.());
        expect(hook.result.current.connected).toBe(false);
    });

    it('forwards the snapshot and per-stage progress', () => {
        const onSnapshot = vi.fn();
        const onProgress = vi.fn();
        const { source } = setup({ onSnapshot, onProgress });
        act(() => source.emit('files.snapshot', { type: 'files.snapshot', files: [state()] }));
        act(() => source.emit('file.updated', { type: 'file.updated', file: state({ progressPercent: 65 }) }));
        expect(onSnapshot).toHaveBeenCalledWith([state()]);
        expect(onProgress).toHaveBeenCalledWith('f1', 65, 'SCENE_DETECTION');
    });

    it('patches cached files with live state', () => {
        const { queryClient, source } = setup();
        const cached = { id: 'f1', name: 'clip.mp4', processingStage: 'EMBEDDING' } as ApiFile;
        queryClient.setQueryData<Page<ApiFile>>(uploadKeys.list({ limit: 100 }), { items: [cached], nextCursor: null });
        act(() => source.emit('file.updated', { type: 'file.updated', file: state({ processingStage: 'INDEXING' }) }));
        const page = queryClient.getQueryData<Page<ApiFile>>(uploadKeys.list({ limit: 100 }));
        expect(page?.items[0].processingStage).toBe('INDEXING');
    });

    it('closes the stream on unmount', () => {
        const { hook, source } = setup();
        hook.unmount();
        expect(source.close).toHaveBeenCalled();
    });
});

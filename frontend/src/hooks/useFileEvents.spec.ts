/**
 * Tests for useFileEvents hook changes:
 * - file.processing.snapshot  → calls onSnapshot
 * - file.processing.started   → calls onProgress with progress=0 and stage
 * - file.processing.progress  → calls onProgress with numeric progress
 * - messages without fileId   → ignored
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Fake WebSocket ─────────────────────────────────────────────────────────────
class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = FakeWebSocket.OPEN;

    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    close = vi.fn();
    ping = vi.fn();

    /** Helper used in tests to push a message into the hook */
    emit(data: unknown) {
        this.onmessage?.({ data: JSON.stringify(data) });
    }

    /** Simulate open */
    open() {
        this.onopen?.();
    }
}

let fakeWs: FakeWebSocket;

vi.stubGlobal(
    'WebSocket',
    vi.fn().mockImplementation(() => {
        fakeWs = new FakeWebSocket();
        return fakeWs;
    }),
);

// ── Import after stubbing ──────────────────────────────────────────────────────
import { useFileEvents } from './useFileEvents';

// ── Helpers ───────────────────────────────────────────────────────────────────
function createWrapper() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('useFileEvents', () => {
    let onProgress: ReturnType<typeof vi.fn>;
    let onSnapshot: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        onProgress = vi.fn();
        onSnapshot = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    function renderAndOpen(
        progressCb = onProgress,
        snapshotCb = onSnapshot,
    ) {
        const { result } = renderHook(
            () => useFileEvents(progressCb, snapshotCb),
            { wrapper: createWrapper() },
        );
        // Simulate WS open so the hook sets connected=true
        fakeWs.open();
        return result;
    }

    // ── snapshot ──────────────────────────────────────────────────────────────

    it('routes file.processing.snapshot to onSnapshot with the files array', () => {
        renderAndOpen();

        const files = [
            { id: 'f1', processingStage: 'EMBEDDING', uploadStatus: 'COMPLETED' },
            { id: 'f2', processingStage: 'UPLOAD', uploadStatus: 'FAILED' },
        ];

        fakeWs.emit({ type: 'file.processing.snapshot', files });

        expect(onSnapshot).toHaveBeenCalledTimes(1);
        expect(onSnapshot).toHaveBeenCalledWith(files);
        // onProgress must NOT be called for snapshot messages
        expect(onProgress).not.toHaveBeenCalled();
    });

    it('passes an empty array to onSnapshot when files is absent', () => {
        renderAndOpen();
        fakeWs.emit({ type: 'file.processing.snapshot' });
        expect(onSnapshot).toHaveBeenCalledWith([]);
    });

    // ── processing.started ────────────────────────────────────────────────────

    it('calls onProgress with progress=0 and the correct stage for file.processing.started', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.processing.started',
            fileId: 'file-abc',
            stage: 'SCENE_DETECTION',
        });

        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(onProgress).toHaveBeenCalledWith('file-abc', 'file.processing.started', 0, 'SCENE_DETECTION');
    });

    it('uses file.processingStage when top-level stage is absent in file.processing.started', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.processing.started',
            fileId: 'file-abc',
            file: { id: 'file-abc', processingStage: 'EMBEDDING' },
        });

        expect(onProgress).toHaveBeenCalledWith('file-abc', 'file.processing.started', 0, 'EMBEDDING');
    });

    it('seeds progress=0 even when the event carries explicit progress=0', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.processing.started',
            fileId: 'file-abc',
            stage: 'INDEXING',
            progress: 0,
        });

        expect(onProgress).toHaveBeenCalledWith('file-abc', 'file.processing.started', 0, 'INDEXING');
    });

    // ── progress events ───────────────────────────────────────────────────────

    it('calls onProgress with the numeric progress value for file.processing.progress', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.processing.progress',
            fileId: 'file-xyz',
            progress: 45,
            stage: 'SCENE_DETECTION',
        });

        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(onProgress).toHaveBeenCalledWith('file-xyz', 'file.processing.progress', 45, 'SCENE_DETECTION');
    });

    it('calls onProgress for file.upload.progress with the correct value', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.upload.progress',
            fileId: 'file-xyz',
            progress: 30,
        });

        expect(onProgress).toHaveBeenCalledWith('file-xyz', 'file.upload.progress', 30, undefined);
    });

    // ── messages without fileId ───────────────────────────────────────────────

    it('ignores non-snapshot messages that have no fileId', () => {
        renderAndOpen();

        fakeWs.emit({
            type: 'file.processing.progress',
            // no fileId
            progress: 50,
        });

        expect(onProgress).not.toHaveBeenCalled();
        expect(onSnapshot).not.toHaveBeenCalled();
    });

    // ── malformed JSON ────────────────────────────────────────────────────────

    it('silently ignores malformed JSON messages', () => {
        renderAndOpen();
        // Send a raw non-JSON string by directly calling onmessage
        fakeWs.onmessage?.({ data: 'not-json' });

        expect(onProgress).not.toHaveBeenCalled();
        expect(onSnapshot).not.toHaveBeenCalled();
    });
});

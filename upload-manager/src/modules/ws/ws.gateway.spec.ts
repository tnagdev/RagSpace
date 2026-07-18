/**
 * Tests for WsGateway.sendSnapshotToClient:
 * - Queries files with processingStage=UPLOAD and uploadStatus != FAILED
 * - Marks found stuck files as FAILED via updateMany
 * - Sends a file.processing.snapshot WS message to the client
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WsGateway } from './ws.gateway';
import { WsService } from './ws.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingStage, UploadStatus } from '@prisma/client';
import { WebSocket } from 'ws';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeFakeClient(readyState = WebSocket.OPEN) {
    return {
        readyState,
        send: jest.fn(),
        close: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
        ping: jest.fn(),
    } as unknown as WebSocket;
}

// ── suite ──────────────────────────────────────────────────────────────────────

describe('WsGateway.sendSnapshotToClient', () => {
    let gateway: WsGateway;
    let prisma: jest.Mocked<{
        file: {
            findMany: jest.Mock;
            updateMany: jest.Mock;
        };
    }>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WsGateway,
                {
                    provide: WsService,
                    useValue: {
                        addClient: jest.fn().mockReturnValue(true),
                        removeClient: jest.fn(),
                        hasClients: jest.fn().mockReturnValue(true),
                        broadcast: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue([]),
                    },
                },
                {
                    provide: PrismaService,
                    useValue: {
                        file: {
                            findMany: jest.fn(),
                            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                        },
                    },
                },
            ],
        }).compile();

        gateway = module.get<WsGateway>(WsGateway);
        prisma = module.get(PrismaService) as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // expose private method for unit-testing
    async function callSnapshot(client: WebSocket, userId: string) {
        return (gateway as any).sendSnapshotToClient(client, userId);
    }

    // ── stuck-upload detection ─────────────────────────────────────────────────

    it('queries for files in UPLOAD stage that are not already FAILED', async () => {
        prisma.file.findMany.mockResolvedValue([]);

        await callSnapshot(makeFakeClient(), 'user-1');

        // First findMany call is the stuckUploads query
        expect(prisma.file.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    userId: 'user-1',
                    processingStage: ProcessingStage.UPLOAD,
                    uploadStatus: { not: UploadStatus.FAILED },
                }),
            }),
        );
    });

    it('calls updateMany to mark stuck UPLOAD files as FAILED', async () => {
        const stuckFiles = [
            { id: 'f1', processingStage: ProcessingStage.UPLOAD, uploadStatus: UploadStatus.UPLOADING },
        ];
        // First call returns stuck uploads; second call returns active files
        prisma.file.findMany
            .mockResolvedValueOnce(stuckFiles)
            .mockResolvedValueOnce([]);

        await callSnapshot(makeFakeClient(), 'user-1');

        expect(prisma.file.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['f1'] }, userId: 'user-1' },
            data: { uploadStatus: UploadStatus.FAILED },
        });
    });

    it('does NOT call updateMany when there are no stuck files', async () => {
        prisma.file.findMany
            .mockResolvedValueOnce([])   // stuckUploads
            .mockResolvedValueOnce([]);  // activeFiles

        await callSnapshot(makeFakeClient(), 'user-1');

        expect(prisma.file.updateMany).not.toHaveBeenCalled();
    });

    // ── snapshot message ───────────────────────────────────────────────────────

    it('sends a file.processing.snapshot message to an OPEN client', async () => {
        const activeFile = {
            id: 'f2',
            processingStage: ProcessingStage.SCENE_DETECTION,
            processingStatus: 'IN_PROGRESS',
            uploadStatus: UploadStatus.COMPLETED,
            originalFilename: 'video.mp4',
        };

        prisma.file.findMany
            .mockResolvedValueOnce([])         // no stuck uploads
            .mockResolvedValueOnce([activeFile]); // active files

        const client = makeFakeClient(WebSocket.OPEN);
        await callSnapshot(client, 'user-1');

        expect(client.send).toHaveBeenCalledTimes(1);
        const sent = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(sent.type).toBe('file.processing.snapshot');
        expect(sent.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'f2', processingStage: ProcessingStage.SCENE_DETECTION }),
            ]),
        );
    });

    it('includes stuck-upload files in the snapshot with uploadStatus=FAILED', async () => {
        const stuckFile = { id: 'f-stuck', processingStage: ProcessingStage.UPLOAD, uploadStatus: UploadStatus.UPLOADING };

        prisma.file.findMany
            .mockResolvedValueOnce([stuckFile])  // stuck uploads
            .mockResolvedValueOnce([]);           // no active files

        const client = makeFakeClient(WebSocket.OPEN);
        await callSnapshot(client, 'user-1');

        const sent = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(sent.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'f-stuck', uploadStatus: UploadStatus.FAILED }),
            ]),
        );
    });

    it('does NOT send the snapshot when the client socket is not OPEN', async () => {
        prisma.file.findMany.mockResolvedValue([]);

        const closedClient = makeFakeClient(WebSocket.CLOSED as any);
        await callSnapshot(closedClient, 'user-1');

        expect(closedClient.send).not.toHaveBeenCalled();
    });

    it('sends an empty files array when there are no active or stuck files', async () => {
        prisma.file.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const client = makeFakeClient(WebSocket.OPEN);
        await callSnapshot(client, 'user-1');

        const sent = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(sent.type).toBe('file.processing.snapshot');
        expect(sent.files).toEqual([]);
    });
});

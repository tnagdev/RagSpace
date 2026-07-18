/**
 * Tests for RabbitmqService.handleSseMessage changes:
 * - PROCESSING_STARTED events broadcast progress: 0
 * - PROCESSING_PROGRESS events broadcast progress from data.progress
 * - UPLOAD_PROGRESS events broadcast progress from data.progress
 */

// ── module mocks (must be declared before imports) ─────────────────────────────
jest.mock('amqp-connection-manager', () => ({
    connect: jest.fn(() => ({
        on: jest.fn(),
        createChannel: jest.fn(() => ({
            waitForConnect: jest.fn().mockResolvedValue(undefined),
            publish: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
        })),
        close: jest.fn().mockResolvedValue(undefined),
    })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RabbitmqService, FileEventType } from './rabbitmq.service';
import { WsService } from '../ws/ws.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumeMessage } from 'amqplib';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Build a fake amqplib ConsumeMessage from a plain object payload */
function makeMsg(payload: Record<string, unknown>): ConsumeMessage {
    return {
        content: Buffer.from(JSON.stringify(payload)),
        fields: {} as any,
        properties: {} as any,
    } as ConsumeMessage;
}

const USER_ID = 'user-test-1';
const FILE_ID = 'file-test-1';

const baseFile = {
    id: FILE_ID,
    userId: USER_ID,
    filename: 'test.mp4',
    originalFilename: 'test.mp4',
    fileSize: 1000,
    mimeType: 'video/mp4',
    fileType: 'VIDEO',
    s3Key: 'key',
    s3Url: null,
    uploadStatus: 'COMPLETED',
    processingStatus: 'IN_PROGRESS',
    processingStage: 'SCENE_DETECTION',
    thumbnailPath: null,
    errorMessage: null,
    processingRetryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
};

// ── test suite ─────────────────────────────────────────────────────────────────

describe('RabbitmqService.handleSseMessage', () => {
    let service: RabbitmqService;
    let wsService: jest.Mocked<WsService>;
    let prisma: jest.Mocked<{ file: Record<string, jest.Mock> }>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RabbitmqService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const config: Record<string, string> = {
                                'rabbitmq.exchange': 'file.events',
                                'rabbitmq.queue': 'file-queue',
                                'rabbitmq.url': 'amqp://localhost',
                            };
                            return config[key];
                        }),
                    },
                },
                {
                    provide: WsService,
                    useValue: {
                        hasClients: jest.fn().mockReturnValue(true),
                        broadcast: jest.fn(),
                    },
                },
                {
                    provide: PrismaService,
                    useValue: {
                        file: {
                            findUnique: jest.fn().mockResolvedValue(baseFile),
                        },
                    },
                },
            ],
        }).compile();

        service = module.get<RabbitmqService>(RabbitmqService);
        wsService = module.get(WsService) as jest.Mocked<WsService>;
        prisma = module.get(PrismaService) as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Access the private method via bracket notation for testing
    async function callHandleSse(msg: ConsumeMessage) {
        return (service as any).handleSseMessage(msg);
    }

    // ── PROCESSING_STARTED ────────────────────────────────────────────────────

    it('broadcasts progress: 0 for PROCESSING_STARTED events', async () => {
        const msg = makeMsg({
            type: FileEventType.PROCESSING_STARTED,
            fileId: FILE_ID,
            userId: USER_ID,
            data: { stage: 'SCENE_DETECTION' },
        });

        await callHandleSse(msg);

        expect(wsService.broadcast).toHaveBeenCalledTimes(1);
        expect(wsService.broadcast).toHaveBeenCalledWith(
            USER_ID,
            expect.objectContaining({
                fileId: FILE_ID,
                type: FileEventType.PROCESSING_STARTED,
                progress: 0,
            }),
        );
    });

    it('uses data.progress (not undefined) for PROCESSING_STARTED even if data.progress=0', async () => {
        const msg = makeMsg({
            type: FileEventType.PROCESSING_STARTED,
            fileId: FILE_ID,
            userId: USER_ID,
            data: { stage: 'EMBEDDING', progress: 0 },
        });

        await callHandleSse(msg);

        const call = wsService.broadcast.mock.calls[0][1] as any;
        expect(call.progress).toBe(0);
    });

    // ── PROCESSING_PROGRESS ────────────────────────────────────────────────────

    it('broadcasts progress: 45 for PROCESSING_PROGRESS events with data.progress=45', async () => {
        const msg = makeMsg({
            type: FileEventType.PROCESSING_PROGRESS,
            fileId: FILE_ID,
            userId: USER_ID,
            data: { stage: 'SCENE_DETECTION', progress: 45 },
        });

        await callHandleSse(msg);

        expect(wsService.broadcast).toHaveBeenCalledWith(
            USER_ID,
            expect.objectContaining({
                progress: 45,
                type: FileEventType.PROCESSING_PROGRESS,
            }),
        );
    });

    it('broadcasts undefined progress for non-started/progress events without data.progress', async () => {
        const msg = makeMsg({
            type: FileEventType.PROCESSING_COMPLETED,
            fileId: FILE_ID,
            userId: USER_ID,
            data: {},
        });

        await callHandleSse(msg);

        const call = wsService.broadcast.mock.calls[0][1] as any;
        // Should be undefined (no progress in event, not a STARTED event)
        expect(call.progress).toBeUndefined();
    });

    // ── UPLOAD_PROGRESS ────────────────────────────────────────────────────────

    it('broadcasts progress: 30 for UPLOAD_PROGRESS events with data.progress=30', async () => {
        const msg = makeMsg({
            type: FileEventType.UPLOAD_PROGRESS,
            fileId: FILE_ID,
            userId: USER_ID,
            data: { progress: 30 },
        });

        await callHandleSse(msg);

        expect(wsService.broadcast).toHaveBeenCalledWith(
            USER_ID,
            expect.objectContaining({
                progress: 30,
                type: FileEventType.UPLOAD_PROGRESS,
            }),
        );
    });

    // ── guard: no clients ──────────────────────────────────────────────────────

    it('skips broadcast when there are no WS clients for the user', async () => {
        (wsService.hasClients as jest.Mock).mockReturnValue(false);

        const msg = makeMsg({
            type: FileEventType.PROCESSING_STARTED,
            fileId: FILE_ID,
            userId: USER_ID,
            data: {},
        });

        await callHandleSse(msg);

        expect(wsService.broadcast).not.toHaveBeenCalled();
    });

    // ── guard: missing fileId ──────────────────────────────────────────────────

    it('returns early when fileId is missing', async () => {
        const msg = makeMsg({
            type: FileEventType.PROCESSING_PROGRESS,
            userId: USER_ID,
            data: { progress: 10 },
        });

        await callHandleSse(msg);

        expect(wsService.broadcast).not.toHaveBeenCalled();
    });

    // ── guard: null message ────────────────────────────────────────────────────

    it('returns early for a null message', async () => {
        await callHandleSse(null as any);
        expect(wsService.broadcast).not.toHaveBeenCalled();
    });
});

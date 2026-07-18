import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WsService } from './ws.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingStage, UploadStatus } from '@prisma/client';

const PING_INTERVAL_MS = 30_000;

@WebSocketGateway({ path: '/ws/upload-events' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer() server!: Server;
    private readonly logger = new Logger(WsGateway.name);
    private readonly heartbeatTimers = new Map<WebSocket, NodeJS.Timeout>();

    constructor(
        private readonly wsService: WsService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
        const allowedOrigins = this.configService.get<string[]>('allowedWsOrigins') ?? [];
        const origin = req.headers.origin ?? '';
        if (allowedOrigins.length > 0 && !allowedOrigins.some(o => origin === o)) {
            this.logger.warn(`WS rejected: disallowed origin "${origin}"`);
            client.close(1008, 'Forbidden');
            return;
        }

        const userId = await this.authenticate(req);
        if (!userId) {
            client.close(1008, 'Unauthorized');
            return;
        }

        const accepted = this.wsService.addClient(userId, client);
        if (!accepted) {
            this.logger.warn(`WS rejected: too many connections for user ${userId}`);
            client.close(1008, 'Too many connections');
            return;
        }

        (client as any)['userId'] = userId;
        (client as any)['isAlive'] = true;

        client.on('pong', () => { (client as any)['isAlive'] = true; });

        const timer = setInterval(() => {
            if (!(client as any)['isAlive']) {
                this.logger.debug(`Terminating stale WS connection for user ${userId}`);
                client.terminate();
                return;
            }
            (client as any)['isAlive'] = false;
            client.ping();
        }, PING_INTERVAL_MS);

        this.heartbeatTimers.set(client, timer);
        this.logger.debug(`WS connected: user ${userId}`);

        // Send the current processing state snapshot to the newly connected client
        // and mark any stuck UPLOAD-stage files as FAILED (browser upload was interrupted)
        this.sendSnapshotToClient(client, userId).catch((err) => {
            this.logger.warn(`Failed to send WS snapshot to user ${userId}: ${err.message}`);
        });
    }

    private async sendSnapshotToClient(client: WebSocket, userId: string): Promise<void> {
        // Files still in UPLOAD stage when the browser reconnects via WS means the XHR
        // was interrupted — mark them FAILED immediately.
        const inProgressStages: ProcessingStage[] = [
            ProcessingStage.EMBEDDING,
            ProcessingStage.SCENE_DETECTION,
            ProcessingStage.INDEXING,
        ];

        // Only consider a file "stuck" if it has been in UPLOAD stage for more
        // than 5 minutes.  Files created within the last 5 minutes are actively
        // being uploaded by the browser — marking them FAILED here would race
        // with the in-flight XHR and wrongly fail legitimate uploads.
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1_000);
        const stuckUploads = await this.prisma.file.findMany({
            where: {
                userId,
                processingStage: ProcessingStage.UPLOAD,
                uploadStatus: { not: UploadStatus.FAILED },
                createdAt: { lt: staleThreshold },
            },
            select: { id: true, processingStage: true, uploadStatus: true },
        });

        if (stuckUploads.length > 0) {
            await this.prisma.file.updateMany({
                where: { id: { in: stuckUploads.map(f => f.id) }, userId },
                data: { uploadStatus: UploadStatus.FAILED },
            });
            this.logger.debug(
                `Marked ${stuckUploads.length} stuck UPLOAD file(s) as FAILED for user ${userId}`,
            );
        }

        // Build snapshot: all actively processing files + the ones we just failed
        const activeFiles = await this.prisma.file.findMany({
            where: {
                userId,
                processingStage: { in: inProgressStages },
                uploadStatus: UploadStatus.COMPLETED,
            },
            select: {
                id: true, processingStage: true, processingStatus: true,
                uploadStatus: true, originalFilename: true,
            },
        });

        const snapshotFiles = [
            ...stuckUploads.map(f => ({
                id: f.id,
                processingStage: f.processingStage as string,
                uploadStatus: UploadStatus.FAILED as string,
            })),
            ...activeFiles.map(f => ({
                id: f.id,
                processingStage: f.processingStage as string,
                uploadStatus: f.uploadStatus as string,
                processingStatus: f.processingStatus as string,
                originalFilename: f.originalFilename,
            })),
        ];

        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'file.processing.snapshot',
                files: snapshotFiles,
            }));
        }
    }

    handleDisconnect(client: WebSocket): void {
        const timer = this.heartbeatTimers.get(client);
        if (timer) {
            clearInterval(timer);
            this.heartbeatTimers.delete(client);
        }

        const userId: string | undefined = (client as any)['userId'];
        if (userId) {
            this.wsService.removeClient(userId, client);
            this.logger.debug(`WS disconnected: user ${userId}`);
        }
    }

    onModuleDestroy(): void {
        for (const timer of this.heartbeatTimers.values()) {
            clearInterval(timer);
        }
        this.heartbeatTimers.clear();
    }

    private async authenticate(req: IncomingMessage): Promise<string | null> {
        const cookie = req.headers.cookie ?? '';
        if (!cookie) return null;

        const authUrl = this.configService.get<string>('authServiceUrl')
            ?? process.env.AUTH_SERVICE_URL;

        if (!authUrl) {
            this.logger.error('AUTH_SERVICE_URL not configured');
            return null;
        }

        try {
            const res = await fetch(`${authUrl}/auth/session`, {
                headers: { cookie, 'user-agent': req.headers['user-agent'] ?? '' },
                signal: AbortSignal.timeout(5_000),
            });

            if (!res.ok) return null;
            const data = await res.json() as { user?: { id: string } };
            return data?.user?.id ?? null;
        } catch (err) {
            this.logger.warn(`WS auth failed: ${(err as Error).message}`);
            return null;
        }
    }
}

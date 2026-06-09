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

const PING_INTERVAL_MS = 30_000;

@WebSocketGateway({ path: '/ws/upload-events' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer() server!: Server;
    private readonly logger = new Logger(WsGateway.name);
    private readonly heartbeatTimers = new Map<WebSocket, NodeJS.Timeout>();

    constructor(
        private readonly wsService: WsService,
        private readonly configService: ConfigService,
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

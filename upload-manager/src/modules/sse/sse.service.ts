import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Response } from 'express';

interface SseClient {
    res: Response;
    heartbeat: NodeJS.Timeout;
}

@Injectable()
export class SseService implements OnModuleDestroy {
    private readonly logger = new Logger(SseService.name);
    private readonly clients = new Map<string, Set<SseClient>>();

    addClient(userId: string, res: Response): () => void {
        const client: SseClient = {
            res,
            heartbeat: setInterval(() => {
                try {
                    res.write(': heartbeat\n\n');
                } catch {
                    this.removeClient(userId, client);
                }
            }, 25_000),
        };

        if (!this.clients.has(userId)) {
            this.clients.set(userId, new Set());
        }
        this.clients.get(userId)!.add(client);
        this.logger.debug(`SSE client connected for user ${userId} (active: ${this.clients.get(userId)!.size})`);

        return () => this.removeClient(userId, client);
    }

    private removeClient(userId: string, client: SseClient): void {
        clearInterval(client.heartbeat);
        const userClients = this.clients.get(userId);
        if (!userClients) return;
        userClients.delete(client);
        if (userClients.size === 0) {
            this.clients.delete(userId);
        }
        this.logger.debug(`SSE client disconnected for user ${userId}`);
    }

    broadcast(userId: string, eventName: string, data: unknown): void {
        const userClients = this.clients.get(userId);
        if (!userClients || userClients.size === 0) return;

        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        const dead: SseClient[] = [];

        for (const client of userClients) {
            try {
                client.res.write(payload);
            } catch {
                dead.push(client);
            }
        }

        dead.forEach(client => this.removeClient(userId, client));
    }

    onModuleDestroy(): void {
        for (const [, clients] of this.clients) {
            for (const client of clients) {
                clearInterval(client.heartbeat);
                try { client.res.end(); } catch { /* ignore */ }
            }
        }
        this.clients.clear();
    }
}

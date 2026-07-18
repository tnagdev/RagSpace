import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { WebSocket } from 'ws';

const MAX_CONNECTIONS_PER_USER = 5;

@Injectable()
export class WsService implements OnModuleDestroy {
    private readonly clients = new Map<string, Set<WebSocket>>();

    addClient(userId: string, client: WebSocket): boolean {
        if (!this.clients.has(userId)) {
            this.clients.set(userId, new Set());
        }
        const userClients = this.clients.get(userId)!;
        if (userClients.size >= MAX_CONNECTIONS_PER_USER) {
            return false;
        }
        userClients.add(client);
        return true;
    }

    removeClient(userId: string, client: WebSocket): void {
        const userClients = this.clients.get(userId);
        if (!userClients) return;
        userClients.delete(client);
        if (userClients.size === 0) this.clients.delete(userId);
    }

    hasClients(userId: string): boolean {
        const c = this.clients.get(userId);
        return !!(c && c.size > 0);
    }

    broadcast(userId: string, data: unknown): void {
        const userClients = this.clients.get(userId);
        if (!userClients || userClients.size === 0) return;

        const payload = JSON.stringify(data);
        const dead: WebSocket[] = [];

        for (const client of userClients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(payload);
                } catch {
                    dead.push(client);
                }
            } else if (client.readyState !== WebSocket.CONNECTING) {
                dead.push(client);
            }
        }

        dead.forEach(c => this.removeClient(userId, c));
    }

    onModuleDestroy(): void {
        for (const [, clients] of this.clients) {
            for (const client of clients) {
                try { client.terminate(); } catch { /* ignore */ }
            }
        }
        this.clients.clear();
    }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus, eventsV1 } from '@ragspace/shared-ts';
import { config } from '../config';
import { tooManyRequests } from '../http/problem';
import { logger } from '../logger';

type Listener = (update: eventsV1.FileUpdated) => void;

@Injectable()
export class FileUpdatesService implements OnModuleInit, OnModuleDestroy {
    private readonly bus = new EventBus(config.rabbitmqUrl, 'api-gateway', logger);
    private readonly listeners = new Map<string, Set<Listener>>();

    onModuleInit(): void {
        this.bus.start();
        // Every gateway instance needs every update, so each gets its own exclusive queue.
        this.bus.subscribe({ queue: 'gateway.file-updates', routingKeys: ['file.updated'], exclusive: true, prefetch: 100 }, async (envelope) => {
            if (envelope.payload?.$case !== 'fileUpdated') return;
            const update = envelope.payload.fileUpdated;
            for (const listener of this.listeners.get(update.userId) ?? []) listener(update);
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.bus.close();
    }

    listen(userId: string, listener: Listener): () => void {
        const listeners = this.listeners.get(userId) ?? new Set<Listener>();
        if (listeners.size >= config.maxStreamsPerUser) {
            throw tooManyRequests(`At most ${config.maxStreamsPerUser} event streams per user`);
        }
        listeners.add(listener);
        this.listeners.set(userId, listeners);
        return () => {
            listeners.delete(listener);
            if (!listeners.size) this.listeners.delete(userId);
        };
    }
}

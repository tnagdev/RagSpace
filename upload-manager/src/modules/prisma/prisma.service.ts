import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    private static pool: Pool;

    constructor() {
        if (!PrismaService.pool) {
            PrismaService.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                max: 10,                        // cap connections per service instance
                idleTimeoutMillis: 30_000,
                connectionTimeoutMillis: 10_000,
            });

            PrismaService.pool.on('error', (err) => {
                // Log but do not crash — the pool will create a new client on next request
                new Logger(PrismaService.name).error('Unexpected pg pool error', err.message);
            });
        }
        const adapter = new PrismaPg(PrismaService.pool);
        super({
            adapter,
            // Only log slow queries / errors in production; full verbosity in dev
            log: isProduction
                ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
                : ['query', 'info', 'warn', 'error'],
        });
    }

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Successfully connected to database');
        } catch (error) {
            this.logger.error('Failed to connect to database', error);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Disconnected from database');
    }

    async cleanDatabase() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot clean database in production');
        }

        const models = Reflect.ownKeys(this).filter(
            key => key[0] !== '_' && key !== 'constructor'
        );

        return Promise.all(
            models.map((modelKey) => {
                const model = this[modelKey as keyof this];
                if (model && typeof model === 'object' && 'deleteMany' in model) {
                    return (model as any).deleteMany();
                }
            })
        );
    }
}

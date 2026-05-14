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
                max: 10,
                idleTimeoutMillis: 30_000,
                connectionTimeoutMillis: 10_000,
            });

            PrismaService.pool.on('error', (err) => {
                new Logger(PrismaService.name).error('Unexpected pg pool error', err.message);
            });
        }
        const adapter = new PrismaPg(PrismaService.pool);
        super({
            adapter,
            log: isProduction
                ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
                : ['query', 'info', 'warn', 'error'],
        });
    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log('Successfully connected to database');
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Disconnected from database');
    }
}

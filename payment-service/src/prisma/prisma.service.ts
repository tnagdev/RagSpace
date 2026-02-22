import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    private static pool: Pool;

    constructor() {
        if (!PrismaService.pool) {
            PrismaService.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000
            });

            PrismaService.pool.on('error', (err) => {
                this.logger.error('Unexpected database pool error', err);
            });
        }

        const adapter = new PrismaPg(PrismaService.pool);
        super({
            adapter,
            log: ['query', 'info', 'warn', 'error'],
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
}

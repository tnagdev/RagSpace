import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private static pool: Pool;

    constructor() {
        if (!PrismaService.pool) {
            PrismaService.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                max: 5,                      // Maximum 5 connections per service
                idleTimeoutMillis: 30000,    // Close idle connections after 30s
                connectionTimeoutMillis: 10000, // Fail after 10s if no connection available
            });
        }

        const adapter = new PrismaPg(PrismaService.pool);

        super({
            adapter,
            log: ['error', 'warn'],
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}

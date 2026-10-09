import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, UsageMetricType, UsageQuota } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

export interface QuotaResult {
    allowed: boolean;
    used: number;
    limit: number;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UsageService {
    private readonly logger = new Logger(UsageService.name);

    constructor(
        private prisma: PrismaService,
        private subscriptionService: SubscriptionService,
    ) { }

    async getQuotas(userId: string): Promise<{ planType: string; quotas: UsageQuota[] }> {
        const subscription = await this.subscriptionService.ensureSubscription(userId);
        const quotas = await this.prisma.usageQuota.findMany({
            where: { subscriptionId: subscription.id },
            orderBy: { metricType: 'asc' },
        });
        return { planType: subscription.plan.type, quotas };
    }

    async consume(userId: string, metric: UsageMetricType, amount: number, requestId?: string): Promise<QuotaResult> {
        const subscription = await this.subscriptionService.ensureSubscription(userId);
        return this.idempotent(requestId && `consume:${userId}:${requestId}`, async (tx) => {
            const rows = await tx.$queryRaw<{ used: bigint; limit: bigint }[]>`
                UPDATE "payment"."usage_quotas"
                SET "used" = "used" + ${BigInt(amount)}, "updatedAt" = now()
                WHERE "subscriptionId" = ${subscription.id}
                  AND "metricType"::text = ${metric}
                  AND ("limit" = 0 OR "used" + ${BigInt(amount)} <= "limit")
                RETURNING "used", "limit"`;

            if (rows.length === 0) {
                const quota = await tx.usageQuota.findUnique({
                    where: { subscriptionId_metricType: { subscriptionId: subscription.id, metricType: metric } },
                    select: { used: true, limit: true },
                });
                return { allowed: false, used: Number(quota?.used ?? 0), limit: Number(quota?.limit ?? 0) };
            }

            await tx.usageRecord.create({
                data: { userId, subscriptionId: subscription.id, metricType: metric, amount },
            });
            return { allowed: true, used: Number(rows[0].used), limit: Number(rows[0].limit) };
        });
    }

    async release(userId: string, metric: UsageMetricType, amount: number, requestId?: string): Promise<void> {
        const subscription = await this.subscriptionService.findCurrentSubscription(userId);
        if (!subscription) return;
        await this.idempotent(requestId && `release:${userId}:${requestId}`, async (tx) => {
            await tx.$executeRaw`
                UPDATE "payment"."usage_quotas"
                SET "used" = GREATEST("used" - ${BigInt(amount)}, 0), "updatedAt" = now()
                WHERE "subscriptionId" = ${subscription.id} AND "metricType"::text = ${metric}`;
            return { allowed: true, used: 0, limit: 0 };
        });
    }

    private async idempotent(
        key: string | undefined | '',
        work: (tx: Prisma.TransactionClient) => Promise<QuotaResult>,
    ): Promise<QuotaResult> {
        if (!key) return this.prisma.$transaction(work);

        const replay = await this.prisma.idempotencyKey.findUnique({ where: { key } });
        if (replay) return replay.response as unknown as QuotaResult;

        try {
            return await this.prisma.$transaction(async (tx) => {
                await tx.idempotencyKey.create({ data: { key, response: {} } });
                const result = await work(tx);
                await tx.idempotencyKey.update({ where: { key }, data: { response: { ...result } } });
                return result;
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
                if (existing) return existing.response as unknown as QuotaResult;
            }
            throw error;
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async resetMonthlyQuotas() {
        const now = new Date();
        const quotasToReset = await this.prisma.usageQuota.findMany({
            where: {
                resetAt: { lte: now },
                metricType: { notIn: [UsageMetricType.STORAGE, UsageMetricType.MAX_VIDEO_LENGTH, UsageMetricType.MAX_AUDIO_DURATION] },
            },
            select: { id: true, resetAt: true },
            take: 1000,
        });

        for (const quota of quotasToReset) {
            const next = new Date(quota.resetAt!);
            next.setMonth(next.getMonth() + 1);
            await this.prisma.usageQuota.update({ where: { id: quota.id }, data: { used: 0, resetAt: next } });
        }

        this.logger.log(`Reset ${quotasToReset.length} quotas`);
    }

    @Cron(CronExpression.EVERY_HOUR)
    async expireIdempotencyKeys() {
        const { count } = await this.prisma.idempotencyKey.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } },
        });
        if (count > 0) this.logger.log(`Expired ${count} idempotency keys`);
    }
}

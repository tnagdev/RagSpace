import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsageMetricType } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class UsageService {
    private readonly logger = new Logger(UsageService.name);

    constructor(
        private prisma: PrismaService,
        private subscriptionService: SubscriptionService,
    ) { }

    async checkAndReserveUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
    ): Promise<boolean> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            this.logger.warn(`No active subscription for user ${userId}`);
            return false;
        }

        const quota = await this.prisma.usageQuota.findUnique({
            where: {
                subscriptionId_metricType: {
                    subscriptionId: subscription.id,
                    metricType: metric,
                },
            },
        });

        if (!quota) {
            this.logger.warn(`No quota found for metric ${metric}`);
            return false;
        }

        // 0 means unlimited
        if (quota.limit === BigInt(0)) {
            return true;
        }

        // Check if usage would exceed limit
        if (quota.used + BigInt(amount) > quota.limit) {
            this.logger.warn(
                `Usage limit exceeded for user ${userId}, metric ${metric}: ${quota.used + BigInt(amount)}/${quota.limit}`,
            );
            return false;
        }

        return true;
    }

    async trackUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
        metadata?: any,
    ): Promise<void> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            this.logger.warn(`Cannot track usage: No subscription for user ${userId}`);
            return;
        }

        // Update quota
        await this.prisma.usageQuota.update({
            where: {
                subscriptionId_metricType: {
                    subscriptionId: subscription.id,
                    metricType: metric,
                },
            },
            data: {
                used: { increment: amount },
            },
        });

        // Record usage
        await this.prisma.usageRecord.create({
            data: {
                userId,
                subscriptionId: subscription.id,
                metricType: metric,
                amount,
                metadata: metadata || {},
                endpoint: metadata?.endpoint,
                ipAddress: metadata?.ipAddress,
                userAgent: metadata?.userAgent,
            },
        });

        this.logger.log(`Tracked ${amount} ${metric} for user ${userId}`);
    }

    async decrementUsage(
        userId: string,
        metric: UsageMetricType,
        amount: number = 1,
    ): Promise<void> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return;
        }

        await this.prisma.usageQuota.update({
            where: {
                subscriptionId_metricType: {
                    subscriptionId: subscription.id,
                    metricType: metric,
                },
            },
            data: {
                used: { decrement: amount },
            },
        });

        this.logger.log(`Decremented ${amount} ${metric} for user ${userId}`);
    }

    async getUserUsageStats(userId: string, metric?: UsageMetricType) {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return null;
        }

        const where: any = { subscriptionId: subscription.id };
        if (metric) {
            where.metricType = metric;
        }

        const quotas = await this.prisma.usageQuota.findMany({
            where,
        });

        const records = await this.prisma.usageRecord.groupBy({
            by: ['metricType'],
            where: {
                subscriptionId: subscription.id,
                timestamp: {
                    gte: subscription.currentPeriodStart,
                    lte: subscription.currentPeriodEnd,
                },
            },
            _sum: {
                amount: true,
            },
        });

        return {
            period: {
                start: subscription.currentPeriodStart,
                end: subscription.currentPeriodEnd,
            },
            quotas: quotas.map((q) => ({
                metric: q.metricType,
                limit: Number(q.limit),
                used: Number(q.used),
                remaining: q.limit === BigInt(0) ? Infinity : Number(q.limit - q.used),
                resetAt: q.resetAt,
            })),
            totalUsage: records.reduce(
                (acc, r) => ({
                    ...acc,
                    [r.metricType]: r._sum.amount,
                }),
                {},
            ),
        };
    }

    async getUsageHistory(
        userId: string,
        metric?: UsageMetricType,
        startDate?: Date,
        endDate?: Date,
    ) {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return [];
        }

        const where: any = {
            subscriptionId: subscription.id,
        };

        if (metric) {
            where.metricType = metric;
        }

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) where.timestamp.gte = startDate;
            if (endDate) where.timestamp.lte = endDate;
        }

        return this.prisma.usageRecord.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: 100,
        });
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async resetMonthlyQuotas() {
        const now = new Date();

        const quotasToReset = await this.prisma.usageQuota.findMany({
            where: {
                resetAt: {
                    lte: now,
                },
            },
        });

        for (const quota of quotasToReset) {
            await this.prisma.usageQuota.update({
                where: { id: quota.id },
                data: {
                    used: 0,
                    resetAt: this.calculateNextResetDate(quota.resetAt),
                },
            });
        }

        this.logger.log(`Reset ${quotasToReset.length} quotas`);
    }

    private calculateNextResetDate(currentReset: Date): Date {
        const date = new Date(currentReset);
        date.setMonth(date.getMonth() + 1);
        return date;
    }

    async canUseFeature(userId: string, metric: UsageMetricType): Promise<boolean> {
        return this.checkAndReserveUsage(userId, metric, 0);
    }

    async getRemainingQuota(userId: string, metric: UsageMetricType): Promise<number> {
        const subscription = await this.subscriptionService.getUserSubscription(userId);

        if (!subscription) {
            return 0;
        }

        const quota = await this.prisma.usageQuota.findUnique({
            where: {
                subscriptionId_metricType: {
                    subscriptionId: subscription.id,
                    metricType: metric,
                },
            },
        });

        if (!quota) {
            return 0;
        }

        if (quota.limit === BigInt(0)) {
            return Infinity;
        }

        return Math.max(0, Number(quota.limit - quota.used));
    }
}

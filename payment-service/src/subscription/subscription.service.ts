import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LemonSqueezyService } from '../providers/lemon-squeezy/lemon-squeezy.service';
import { PlanService } from '../plan/plan.service';
import { SubscriptionStatus, UsageMetricType } from '@prisma/client';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private prisma: PrismaService,
        private lemonSqueezy: LemonSqueezyService,
        private planService: PlanService,
    ) { }

    async getUserSubscription(userId: string) {
        return this.prisma.subscription.findFirst({
            where: {
                userId,
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { plan: true, usageQuotas: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createSubscription(data: {
        userId: string;
        planId: string;
        lemonSqueezySubscriptionId?: string;
        lemonSqueezyCustomerId?: string;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        status?: SubscriptionStatus;
    }) {
        const plan = await this.planService.getPlanById(data.planId);
        const limits = this.planService.getPlanLimits(plan);

        const subscription = await this.prisma.subscription.create({
            data: {
                userId: data.userId,
                planId: data.planId,
                lemonSqueezySubscriptionId: data.lemonSqueezySubscriptionId,
                lemonSqueezyCustomerId: data.lemonSqueezyCustomerId,
                currentPeriodStart: data.currentPeriodStart,
                currentPeriodEnd: data.currentPeriodEnd,
                status: data.status || SubscriptionStatus.ACTIVE,
            },
            include: { plan: true },
        });

        // Initialize usage quotas
        await this.initializeUsageQuotas(subscription.id, limits);

        this.logger.log(`Created subscription for user ${data.userId}`);
        return subscription;
    }

    async initializeUsageQuotas(
        subscriptionId: string,
        limits: Record<string, number>,
    ) {
        const quotas = Object.entries(limits).map(([metric, limit]) => ({
            subscriptionId,
            metricType: metric as UsageMetricType,
            limit,
            used: 0,
            resetAt: this.calculateResetDate(),
        }));

        await this.prisma.usageQuota.createMany({
            data: quotas,
            skipDuplicates: true,
        });
    }

    async createFreeSubscription(userId: string) {
        const existingSubscription = await this.getUserSubscription(userId);
        if (existingSubscription) {
            this.logger.log(`User ${userId} already has an active subscription`);
            return existingSubscription;
        }

        const freePlan = await this.planService.getPlanByType('FREE' as any);
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setDate(periodEnd.getDate() + 30);

        return this.createSubscription({
            userId,
            planId: freePlan.id,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            status: SubscriptionStatus.ACTIVE,
        });
    }

    async createCheckoutSession(userId: string, planId: string, userEmail: string) {
        const plan = await this.planService.getPlanById(planId);

        if (!plan.lemonSqueezyVariantId) {
            throw new BadRequestException('Plan not configured for checkout');
        }

        const checkoutUrl = await this.lemonSqueezy.createCheckoutSession({
            variantId: plan.lemonSqueezyVariantId,
            userId,
            userEmail,
            customData: { planId },
        });

        return { checkoutUrl };
    }

    async upgradeSubscription(userId: string, newPlanId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const currentPlan = subscription.plan;
        const newPlan = await this.planService.getPlanById(newPlanId);

        if (!this.planService.isUpgrade(currentPlan.type, newPlan.type)) {
            throw new BadRequestException('This is not an upgrade');
        }

        // Update via Lemon Squeezy
        if (subscription.lemonSqueezySubscriptionId && newPlan.lemonSqueezyVariantId) {
            await this.lemonSqueezy.changeSubscriptionPlan(
                subscription.lemonSqueezySubscriptionId,
                newPlan.lemonSqueezyVariantId,
            );
        }

        // Update local subscription
        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId: newPlanId },
            include: { plan: true },
        });

        // Update usage quotas
        await this.updateUsageQuotasForPlanChange(subscription.id, newPlan);

        return updated;
    }

    async downgradeSubscription(userId: string, newPlanId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const currentPlan = subscription.plan;
        const newPlan = await this.planService.getPlanById(newPlanId);

        if (!this.planService.isDowngrade(currentPlan.type, newPlan.type)) {
            throw new BadRequestException('This is not a downgrade');
        }

        // Update via Lemon Squeezy
        if (subscription.lemonSqueezySubscriptionId && newPlan.lemonSqueezyVariantId) {
            await this.lemonSqueezy.changeSubscriptionPlan(
                subscription.lemonSqueezySubscriptionId,
                newPlan.lemonSqueezyVariantId,
            );
        }

        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId: newPlanId },
            include: { plan: true },
        });

        await this.updateUsageQuotasForPlanChange(subscription.id, newPlan);

        return updated;
    }

    async cancelSubscription(userId: string, immediate: boolean = false) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        if (subscription.lemonSqueezySubscriptionId) {
            if (immediate) {
                await this.lemonSqueezy.cancelSubscriptionImmediately(
                    subscription.lemonSqueezySubscriptionId,
                );
            } else {
                await this.lemonSqueezy.cancelSubscriptionAtPeriodEnd(
                    subscription.lemonSqueezySubscriptionId,
                );
            }
        }

        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                cancelAtPeriodEnd: !immediate,
                canceledAt: new Date(),
                status: immediate ? SubscriptionStatus.CANCELLED : subscription.status,
            },
            include: { plan: true },
        });

        return updated;
    }

    async pauseSubscription(userId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        if (subscription.lemonSqueezySubscriptionId) {
            await this.lemonSqueezy.pauseSubscription(
                subscription.lemonSqueezySubscriptionId,
            );
        }

        return this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAUSED },
            include: { plan: true },
        });
    }

    async resumeSubscription(userId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: { userId, status: SubscriptionStatus.PAUSED },
            orderBy: { createdAt: 'desc' },
        });

        if (!subscription) {
            throw new NotFoundException('No paused subscription found');
        }

        if (subscription.lemonSqueezySubscriptionId) {
            await this.lemonSqueezy.resumeSubscription(
                subscription.lemonSqueezySubscriptionId,
            );
        }

        return this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.ACTIVE },
            include: { plan: true },
        });
    }

    private async updateUsageQuotasForPlanChange(subscriptionId: string, newPlan: any) {
        const newLimits = this.planService.getPlanLimits(newPlan);

        for (const [metric, limit] of Object.entries(newLimits)) {
            await this.prisma.usageQuota.upsert({
                where: {
                    subscriptionId_metricType: {
                        subscriptionId,
                        metricType: metric as UsageMetricType,
                    },
                },
                update: { limit },
                create: {
                    subscriptionId,
                    metricType: metric as UsageMetricType,
                    limit,
                    used: 0,
                    resetAt: this.calculateResetDate(),
                },
            });
        }
    }

    private calculateResetDate(): Date {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    async getSubscriptionUsage(userId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            return null;
        }

        const quotas = await this.prisma.usageQuota.findMany({
            where: { subscriptionId: subscription.id },
        });

        return {
            subscription,
            quotas: quotas.map((q) => ({
                metric: q.metricType,
                limit: q.limit,
                used: q.used,
                remaining: q.limit === 0 ? Infinity : q.limit - q.used,
                resetAt: q.resetAt,
            })),
        };
    }
}

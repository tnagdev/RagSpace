import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
        const subscription = await this.prisma.subscription.findFirst({
            where: {
                userId,
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { plan: true, usageQuotas: true },
            orderBy: { createdAt: 'desc' },
        });

        if (!subscription) {
            return null;
        }

        return {
            ...subscription,
            usageQuotas: subscription.usageQuotas.map((q) => ({
                ...q,
                limit: Number(q.limit),
                used: Number(q.used),
            })),
        };
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

        if (data.lemonSqueezySubscriptionId) {
            const existing = await this.prisma.subscription.findUnique({
                where: { lemonSqueezySubscriptionId: data.lemonSqueezySubscriptionId },
                include: { plan: true },
            });

            if (existing) {
                this.logger.log(`Subscription already exists for LemonSqueezy ID ${data.lemonSqueezySubscriptionId}`);
                return existing;
            }
        }

        // Find and deactivate any existing active subscription for this user, carry over usage
        const existingSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: data.userId,
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { usageQuotas: true },
            orderBy: { createdAt: 'desc' },
        });

        // Collect existing usage to carry over
        const existingUsageMap = new Map<string, bigint>();
        if (existingSubscription) {
            this.logger.log(`Found existing subscription ${existingSubscription.id} for user ${data.userId}, will carry over usage and deactivate`);
            for (const quota of existingSubscription.usageQuotas) {
                existingUsageMap.set(quota.metricType, quota.used);
                this.logger.log(`  Carrying over usage: ${quota.metricType} = ${quota.used}`);
            }
        }

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

        await this.initializeUsageQuotas(subscription.id, limits, existingUsageMap);
        if (existingSubscription) {
            const oldLsSubId = existingSubscription.lemonSqueezySubscriptionId;

            await this.prisma.subscription.update({
                where: { id: existingSubscription.id },
                data: {
                    status: SubscriptionStatus.EXPIRED,
                    scheduledPlanId: null,
                    scheduledChangeAt: null,
                    scheduledChangeType: null,
                    cancelAtPeriodEnd: false,
                    lemonSqueezySubscriptionId: null,
                    lemonSqueezyCustomerId: null,
                    lemonSqueezyOrderId: null,
                },
            });
            this.logger.log(`Deactivated old subscription ${existingSubscription.id}`);

            if (oldLsSubId) {
                try {
                    await this.lemonSqueezy.cancelSubscriptionImmediately(oldLsSubId);
                    this.logger.log(`Cancelled old LS subscription ${oldLsSubId}`);
                } catch (error) {
                    this.logger.warn(`Failed to cancel old LS subscription ${oldLsSubId}: ${error.message}`);
                }
            }
        }

        this.logger.log(`Created subscription for user ${data.userId}, usage carried over from previous subscription`);
        return subscription;
    }

    async initializeUsageQuotas(
        subscriptionId: string,
        limits: Record<string, number>,
        existingUsage?: Map<string, bigint>,
    ) {
        const quotas = Object.entries(limits).map(([metric, limit]) => {
            const previousUsed = existingUsage?.get(metric) ?? BigInt(0);
            return {
                subscriptionId,
                metricType: metric as UsageMetricType,
                limit,
                used: Number(previousUsed),
                resetAt: this.calculateResetDate(),
            };
        });

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
            customData: { plan_id: planId },  // Use snake_case to match webhook payload
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

        this.logger.log(`Upgrading subscription ${subscription.id} from ${currentPlan.name} to ${newPlan.name}`);
        this.logger.log(`Current usage quotas: ${JSON.stringify(subscription.usageQuotas)}`);

        if (!this.planService.isUpgrade(currentPlan.type, newPlan.type)) {
            throw new BadRequestException('This is not an upgrade');
        }

        // For upgrades, apply immediately via Lemon Squeezy with proration
        if (subscription.lemonSqueezySubscriptionId && newPlan.lemonSqueezyVariantId) {
            await this.lemonSqueezy.changeSubscriptionPlan(
                subscription.lemonSqueezySubscriptionId,
                newPlan.lemonSqueezyVariantId,
                { invoiceImmediately: true },
            );
        }

        // Update local subscription immediately for upgrades
        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                planId: newPlanId,
                scheduledPlanId: null,
                scheduledChangeAt: null,
                scheduledChangeType: null,
            },
            include: { plan: true },
        });

        // Update usage quotas immediately - ONLY limits, usage values preserved
        await this.updateUsageQuotasForPlanChange(subscription.id, newPlan);

        this.logger.log(`Upgraded subscription ${subscription.id} to plan ${newPlanId} immediately, usage preserved`);
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

        // Set scheduled change FIRST to prevent webhook race condition
        // (LS fires subscription_updated when we change the variant, and the webhook
        // must see the scheduled change so it doesn't apply the plan change immediately)
        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                scheduledPlanId: newPlanId,
                scheduledChangeAt: subscription.currentPeriodEnd,
                scheduledChangeType: 'downgrade'
            },
            include: { plan: true },
        });

        // Lock in new pricing in LemonSqueezy (without proration)
        // This changes the variant so at renewal the lower price is charged
        if (subscription.lemonSqueezySubscriptionId && newPlan.lemonSqueezyVariantId) {
            try {
                await this.lemonSqueezy.changeSubscriptionPlan(
                    subscription.lemonSqueezySubscriptionId,
                    newPlan.lemonSqueezyVariantId,
                    { disableProrations: true },
                );
            } catch (error) {
                // Revert scheduled change if LS API call fails
                await this.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: {
                        scheduledPlanId: null,
                        scheduledChangeAt: null,
                        scheduledChangeType: null,
                    },
                });
                this.logger.error(`Failed to change plan in LemonSqueezy, reverted scheduled change: ${error.message}`);
                throw error;
            }
        }

        // Don't update quotas yet - user keeps higher tier access until period end
        // Cron job will update planId and quotas when scheduledChangeAt is reached

        this.logger.log(`Scheduled downgrade for subscription ${subscription.id} to plan ${newPlanId} at ${subscription.currentPeriodEnd} (new pricing locked in LemonSqueezy, access preserved until period end)`);
        return updated;
    }

    async cancelSubscription(userId: string, immediate: boolean = false) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        this.logger.log(`Cancelling subscription ${subscription.id} (immediate: ${immediate})`);

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

        const freePlan = await this.planService.getPlanByType('FREE' as any);
        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                cancelAtPeriodEnd: !immediate,
                canceledAt: new Date(),
                status: immediate ? SubscriptionStatus.CANCELLED : subscription.status,
                scheduledPlanId: immediate ? null : freePlan.id,
                scheduledChangeAt: immediate ? null : subscription.currentPeriodEnd,
                scheduledChangeType: immediate ? null : 'cancel_to_free',
            },
            include: { plan: true },
        });

        this.logger.log(`Subscription ${subscription.id} ${immediate ? 'cancelled immediately' : `scheduled for cancellation at ${subscription.currentPeriodEnd} - FREE plan transition scheduled`}`);
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

    async updateUsageQuotasForPlanChange(subscriptionId: string, newPlan: any) {
        const newLimits = this.planService.getPlanLimits(newPlan);

        this.logger.log(`Updating quotas for subscription ${subscriptionId} to plan ${newPlan.name}`);

        // Fetch all existing quotas with their current usage
        const existingQuotas = await this.prisma.usageQuota.findMany({
            where: { subscriptionId },
        });

        this.logger.log(`Found ${existingQuotas.length} existing quotas`);

        // Create a map for quick lookup
        const quotaMap = new Map(
            existingQuotas.map((q) => [q.metricType, q])
        );

        for (const [metric, limit] of Object.entries(newLimits)) {
            const existingQuota = quotaMap.get(metric as UsageMetricType);

            if (existingQuota) {
                this.logger.log(`Metric ${metric}: Updating limit ${existingQuota.limit} -> ${limit}, preserving usage ${existingQuota.used}`);

                // Quota exists - ONLY update limit, preserve usage
                await this.prisma.usageQuota.update({
                    where: {
                        subscriptionId_metricType: {
                            subscriptionId,
                            metricType: metric as UsageMetricType,
                        },
                    },
                    data: {
                        limit, // Only update limit, used is automatically preserved
                    },
                });
            } else {
                this.logger.log(`Metric ${metric}: Creating new quota with limit ${limit}, usage 0`);

                // New metric - create with usage 0
                await this.prisma.usageQuota.create({
                    data: {
                        subscriptionId,
                        metricType: metric as UsageMetricType,
                        limit,
                        used: 0,
                        resetAt: this.calculateResetDate(),
                    },
                });
            }
        }

        this.logger.log(`Successfully updated all quotas for subscription ${subscriptionId}, usage values preserved`);
    }

    private calculateResetDate(): Date {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    async cancelScheduledChange(userId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        if (!subscription.scheduledPlanId) {
            throw new BadRequestException('No scheduled changes found');
        }

        if (subscription.scheduledChangeType === 'cancel_to_free' && subscription.lemonSqueezySubscriptionId) {
            await this.lemonSqueezy.resumeSubscription(subscription.lemonSqueezySubscriptionId);
        }

        if (subscription.scheduledChangeType === 'downgrade' && subscription.lemonSqueezySubscriptionId) {
            await this.lemonSqueezy.changeSubscriptionPlan(
                subscription.lemonSqueezySubscriptionId,
                subscription.plan.lemonSqueezyVariantId,
                { invoiceImmediately: false },
            );
        }

        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                scheduledPlanId: null,
                scheduledChangeAt: null,
                scheduledChangeType: null,
                cancelAtPeriodEnd: false,
            },
            include: { plan: true },
        });

        this.logger.log(`Cancelled scheduled change for subscription ${subscription.id}`);
        return updated;
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
                limit: Number(q.limit),
                used: Number(q.used),
                remaining: q.limit === BigInt(0) ? Infinity : Number(q.limit - q.used),
                resetAt: q.resetAt,
            })),
        };
    }

    @Cron(CronExpression.EVERY_6_HOURS)
    async enforceScheduledChanges() {
        this.logger.log('Running enforceScheduledChanges cron job');

        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                scheduledChangeAt: { lte: new Date() },
                scheduledPlanId: { not: null },
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { plan: true },
        });

        for (const sub of subscriptions) {
            try {
                const newPlan = await this.prisma.plan.findUnique({
                    where: { id: sub.scheduledPlanId },
                });

                if (!newPlan) {
                    this.logger.error(`Scheduled plan ${sub.scheduledPlanId} not found for subscription ${sub.id}`);
                    continue;
                }

                const isCancelToFree = sub.scheduledChangeType === 'cancel_to_free';
                await this.prisma.subscription.update({
                    where: { id: sub.id },
                    data: {
                        planId: sub.scheduledPlanId,
                        scheduledPlanId: null,
                        scheduledChangeAt: null,
                        scheduledChangeType: null,
                        ...(isCancelToFree && {
                            status: SubscriptionStatus.EXPIRED,
                            cancelAtPeriodEnd: false,
                            lemonSqueezySubscriptionId: null,
                            lemonSqueezyCustomerId: null,
                            lemonSqueezyOrderId: null,
                        }),
                    },
                });
                await this.updateUsageQuotasForPlanChange(sub.id, newPlan);
                this.logger.log(`Applied scheduled ${sub.scheduledChangeType} for subscription ${sub.id} from ${sub.plan.name} to ${newPlan.name}`);
            } catch (error) {
                this.logger.error(`Failed to apply scheduled change for subscription ${sub.id}:`, error);
            }
        }
    }
}

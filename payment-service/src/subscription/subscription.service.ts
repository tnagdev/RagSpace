import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { PlanService } from '../plan/plan.service';
import { SubscriptionStatus, UsageMetricType } from '@prisma/client';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private prisma: PrismaService,
        private paymentFactory: PaymentProviderFactory,
        private planService: PlanService,
    ) { }

    private getExternalSubscriptionId(subscription: any): string | null {
        if (this.paymentFactory.getProviderName() === 'razorpay') {
            return subscription.razorpaySubscriptionId ?? null;
        }
        return subscription.lemonSqueezySubscriptionId ?? null;
    }

    private getExternalPlanVariantId(plan: any): string | null {
        if (this.paymentFactory.getProviderName() === 'razorpay') {
            return plan.razorpayPlanId ?? null;
        }
        return plan.lemonSqueezyVariantId ?? null;
    }

    private clearProviderFields() {
        return {
            lemonSqueezySubscriptionId: null,
            lemonSqueezyCustomerId: null,
            lemonSqueezyOrderId: null,
            razorpaySubscriptionId: null,
            razorpayCustomerId: null,
        };
    }

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
        razorpaySubscriptionId?: string;
        razorpayCustomerId?: string;
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

        if (data.razorpaySubscriptionId) {
            const existing = await this.prisma.subscription.findUnique({
                where: { razorpaySubscriptionId: data.razorpaySubscriptionId },
                include: { plan: true },
            });
            if (existing) {
                this.logger.log(`Subscription already exists for Razorpay ID ${data.razorpaySubscriptionId}`);
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
                razorpaySubscriptionId: data.razorpaySubscriptionId,
                razorpayCustomerId: data.razorpayCustomerId,
                currentPeriodStart: data.currentPeriodStart,
                currentPeriodEnd: data.currentPeriodEnd,
                status: data.status || SubscriptionStatus.ACTIVE,
            },
            include: { plan: true },
        });

        await this.initializeUsageQuotas(subscription.id, limits, existingUsageMap);
        if (existingSubscription) {
            await this.prisma.subscription.update({
                where: { id: existingSubscription.id },
                data: {
                    status: SubscriptionStatus.EXPIRED,
                    scheduledPlanId: null,
                    scheduledChangeAt: null,
                    scheduledChangeType: null,
                    cancelAtPeriodEnd: false,
                    ...this.clearProviderFields(),
                },
            });
            this.logger.log(`Deactivated old subscription ${existingSubscription.id}`);

            const externalSubId = this.getExternalSubscriptionId(existingSubscription);
            if (externalSubId) {
                try {
                    await this.paymentFactory.getProvider().cancelSubscriptionImmediately(externalSubId);
                    this.logger.log(`Cancelled old provider subscription ${externalSubId}`);
                } catch (error) {
                    this.logger.warn(`Failed to cancel old provider subscription ${externalSubId}: ${error.message}`);
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
        const variantId = this.getExternalPlanVariantId(plan);

        if (!variantId) {
            throw new BadRequestException(
                `Plan not configured for checkout with provider: ${this.paymentFactory.getProviderName()}`,
            );
        }

        const result = await this.paymentFactory.getProvider().createCheckoutSession({
            variantId,
            userId,
            userEmail,
            customData: { plan_id: planId },
        });

        if (this.paymentFactory.getProviderName() === 'razorpay' && result.providerSubscriptionId) {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            await this.prisma.pendingCheckout.upsert({
                where: { razorpaySubscriptionId: result.providerSubscriptionId },
                create: {
                    userId,
                    planId,
                    razorpaySubscriptionId: result.providerSubscriptionId,
                    expiresAt,
                },
                update: { expiresAt, attempts: 0 },
            });
            this.logger.log(`Stored pending checkout for Razorpay subscription ${result.providerSubscriptionId}`);
        }

        return { checkoutUrl: result.checkoutUrl };
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

        const externalSubId = this.getExternalSubscriptionId(subscription);
        const newVariantId = this.getExternalPlanVariantId(newPlan);
        if (externalSubId && newVariantId) {
            await this.paymentFactory.getProvider().changeSubscriptionPlan(
                externalSubId,
                newVariantId,
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

        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                scheduledPlanId: newPlanId,
                scheduledChangeAt: subscription.currentPeriodEnd,
                scheduledChangeType: 'downgrade'
            },
            include: { plan: true },
        });

        const downgradeExternalSubId = this.getExternalSubscriptionId(subscription);
        const downgradeNewVariantId = this.getExternalPlanVariantId(newPlan);
        if (downgradeExternalSubId && downgradeNewVariantId) {
            try {
                await this.paymentFactory.getProvider().changeSubscriptionPlan(
                    downgradeExternalSubId,
                    downgradeNewVariantId,
                    { disableProrations: true },
                );
            } catch (error) {
                await this.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: {
                        scheduledPlanId: null,
                        scheduledChangeAt: null,
                        scheduledChangeType: null,
                    },
                });
                this.logger.error(`Failed to change plan via provider, reverted scheduled change: ${error.message}`);
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

        const cancelExternalSubId = this.getExternalSubscriptionId(subscription);
        if (cancelExternalSubId) {
            if (immediate) {
                await this.paymentFactory.getProvider().cancelSubscriptionImmediately(cancelExternalSubId);
            } else {
                await this.paymentFactory.getProvider().cancelSubscriptionAtPeriodEnd(cancelExternalSubId);
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

        const pauseExternalSubId = this.getExternalSubscriptionId(subscription);
        if (pauseExternalSubId) {
            await this.paymentFactory.getProvider().pauseSubscription(pauseExternalSubId);
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

        const resumeExternalSubId = this.getExternalSubscriptionId(subscription);
        if (resumeExternalSubId) {
            await this.paymentFactory.getProvider().resumeSubscription(resumeExternalSubId);
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

        const schedExternalSubId = this.getExternalSubscriptionId(subscription);
        if (subscription.scheduledChangeType === 'cancel_to_free' && schedExternalSubId) {
            await this.paymentFactory.getProvider().uncancelSubscription(schedExternalSubId);
        }

        const currentVariantId = this.getExternalPlanVariantId(subscription.plan);
        if (subscription.scheduledChangeType === 'downgrade' && schedExternalSubId && currentVariantId) {
            await this.paymentFactory.getProvider().changeSubscriptionPlan(
                schedExternalSubId,
                currentVariantId,
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
                            ...this.clearProviderFields(),
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

    @Cron(CronExpression.EVERY_30_SECONDS)
    async pollPendingRazorpayCheckouts() {
        if (this.paymentFactory.getProviderName() !== 'razorpay') return;

        const pending = await this.prisma.pendingCheckout.findMany({
            where: { expiresAt: { gt: new Date() } },
        });

        if (pending.length === 0) return;

        this.logger.log(`Polling ${pending.length} pending Razorpay checkout(s)`);
        const razorpay = this.paymentFactory.getProvider() as any;

        for (const checkout of pending) {
            try {
                const rzSub = await razorpay.fetchSubscription(checkout.razorpaySubscriptionId);
                this.logger.log(`Pending checkout ${checkout.razorpaySubscriptionId} → Razorpay status: ${rzSub.status}`);

                const activatable = ['authenticated', 'active'];

                if (activatable.includes(rzSub.status)) {
                    await this.createSubscription({
                        userId: checkout.userId,
                        planId: checkout.planId,
                        razorpaySubscriptionId: String(rzSub.id),
                        razorpayCustomerId: rzSub.customer_id ? String(rzSub.customer_id) : undefined,
                        currentPeriodStart: rzSub.current_start
                            ? new Date(rzSub.current_start * 1000)
                            : new Date(),
                        currentPeriodEnd: rzSub.current_end
                            ? new Date(rzSub.current_end * 1000)
                            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        status: rzSub.status === 'active'
                            ? SubscriptionStatus.ACTIVE
                            : SubscriptionStatus.TRIALING,
                    });
                    await this.prisma.pendingCheckout.delete({ where: { id: checkout.id } });
                    this.logger.log(
                        `✅ Activated Razorpay subscription ${checkout.razorpaySubscriptionId} ` +
                        `for user ${checkout.userId} via polling (status: ${rzSub.status})`,
                    );
                } else if (['cancelled', 'expired', 'completed'].includes(rzSub.status)) {
                    await this.prisma.pendingCheckout.delete({ where: { id: checkout.id } });
                    this.logger.warn(
                        `Removed dead pending checkout ${checkout.razorpaySubscriptionId} (status: ${rzSub.status})`,
                    );
                } else {
                    await this.prisma.pendingCheckout.update({
                        where: { id: checkout.id },
                        data: { attempts: { increment: 1 } },
                    });
                }
            } catch (error) {
                this.logger.error(
                    `Failed to poll pending checkout ${checkout.razorpaySubscriptionId}:`,
                    error.message,
                );
            }
        }
    }
}

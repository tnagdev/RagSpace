import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Plan, PlanType, Prisma, SubscriptionStatus, UsageMetricType } from '@prisma/client';
import { PlanLimits, PlanService } from '../plan/plan.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';

const CURRENT_STATUSES: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.PAST_DUE,
];

const WITH_PLAN = { plan: true } as const;

export type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: typeof WITH_PLAN }>;

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private prisma: PrismaService,
        private paymentFactory: PaymentProviderFactory,
        private planService: PlanService,
    ) { }

    private getExternalSubscriptionId(subscription: { razorpaySubscriptionId: string | null; lemonSqueezySubscriptionId: string | null }): string | null {
        if (this.paymentFactory.getProviderName() === 'razorpay') {
            return subscription.razorpaySubscriptionId ?? null;
        }
        return subscription.lemonSqueezySubscriptionId ?? null;
    }

    private getExternalPlanVariantId(plan: Plan): string | null {
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

    hasPaidProviderSubscription(subscription: SubscriptionWithPlan): boolean {
        return subscription.plan.type !== PlanType.FREE && this.getExternalSubscriptionId(subscription) !== null;
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

    findCurrentSubscription(userId: string): Promise<SubscriptionWithPlan | null> {
        return this.prisma.subscription.findFirst({
            where: { userId, status: { in: CURRENT_STATUSES } },
            include: WITH_PLAN,
            orderBy: { createdAt: 'desc' },
        });
    }

    async ensureSubscription(userId: string): Promise<SubscriptionWithPlan> {
        const current = await this.findCurrentSubscription(userId);
        if (current) return current;
        await this.createFreeSubscription(userId);
        const created = await this.findCurrentSubscription(userId);
        if (!created) throw new NotFoundException('Subscription not found');
        return created;
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

        const existingSubscription = await this.prisma.subscription.findFirst({
            where: {
                userId: data.userId,
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { usageQuotas: true },
            orderBy: { createdAt: 'desc' },
        });

        const existingUsageMap = new Map<string, bigint>();
        for (const quota of existingSubscription?.usageQuotas ?? []) {
            existingUsageMap.set(quota.metricType, quota.used);
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
                } catch (error) {
                    this.logger.warn(`Failed to cancel old provider subscription ${externalSubId}: ${error.message}`);
                }
            }
        }

        this.logger.log(`Created subscription for user ${data.userId} on plan ${plan.name}`);
        return subscription;
    }

    async initializeUsageQuotas(
        subscriptionId: string,
        limits: PlanLimits,
        existingUsage?: Map<string, bigint>,
    ) {
        const quotas = Object.entries(limits).map(([metric, limit]) => ({
            subscriptionId,
            metricType: metric as UsageMetricType,
            limit,
            used: Number(existingUsage?.get(metric) ?? BigInt(0)),
            resetAt: this.calculateResetDate(),
        }));

        await this.prisma.usageQuota.createMany({ data: quotas, skipDuplicates: true });
    }

    async createFreeSubscription(userId: string) {
        const existing = await this.findCurrentSubscription(userId);
        if (existing) return existing;

        const freePlan = await this.planService.getPlanByType(PlanType.FREE);
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
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
        }

        return { checkoutUrl: result.checkoutUrl };
    }

    async upgradeSubscription(userId: string, newPlanId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const newPlan = await this.planService.getPlanById(newPlanId);
        if (!this.planService.isUpgrade(subscription.plan.type, newPlan.type)) {
            throw new BadRequestException('This is not an upgrade');
        }

        const externalSubId = this.getExternalSubscriptionId(subscription);
        const newVariantId = this.getExternalPlanVariantId(newPlan);
        if (externalSubId && newVariantId) {
            await this.paymentFactory.getProvider().changeSubscriptionPlan(externalSubId, newVariantId, {
                invoiceImmediately: true,
            });
        }

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

        await this.updateUsageQuotasForPlanChange(subscription.id, newPlan);
        this.logger.log(`Upgraded subscription ${subscription.id} to plan ${newPlanId}`);
        return updated;
    }

    async downgradeSubscription(userId: string, newPlanId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const newPlan = await this.planService.getPlanById(newPlanId);
        if (!this.planService.isDowngrade(subscription.plan.type, newPlan.type)) {
            throw new BadRequestException('This is not a downgrade');
        }

        const updated = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                scheduledPlanId: newPlanId,
                scheduledChangeAt: subscription.currentPeriodEnd,
                scheduledChangeType: 'downgrade',
            },
            include: { plan: true },
        });

        const externalSubId = this.getExternalSubscriptionId(subscription);
        const newVariantId = this.getExternalPlanVariantId(newPlan);
        if (externalSubId && newVariantId) {
            try {
                await this.paymentFactory.getProvider().changeSubscriptionPlan(externalSubId, newVariantId, {
                    disableProrations: true,
                });
            } catch (error) {
                await this.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: { scheduledPlanId: null, scheduledChangeAt: null, scheduledChangeType: null },
                });
                this.logger.error(`Failed to change plan via provider, reverted scheduled change: ${error.message}`);
                throw error;
            }
        }

        // Quotas keep the higher tier until period end; enforceScheduledChanges applies the new plan then.
        this.logger.log(`Scheduled downgrade for subscription ${subscription.id} to plan ${newPlanId} at ${subscription.currentPeriodEnd}`);
        return updated;
    }

    async cancelSubscription(userId: string, immediate: boolean = false) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const externalSubId = this.getExternalSubscriptionId(subscription);
        if (externalSubId) {
            if (immediate) {
                await this.paymentFactory.getProvider().cancelSubscriptionImmediately(externalSubId);
            } else {
                await this.paymentFactory.getProvider().cancelSubscriptionAtPeriodEnd(externalSubId);
            }
        }

        const freePlan = await this.planService.getPlanByType(PlanType.FREE);
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

        this.logger.log(`Subscription ${subscription.id} ${immediate ? 'cancelled immediately' : `scheduled to move to FREE at ${subscription.currentPeriodEnd}`}`);
        return updated;
    }

    async pauseSubscription(userId: string) {
        const subscription = await this.getUserSubscription(userId);
        if (!subscription) {
            throw new NotFoundException('No active subscription found');
        }

        const externalSubId = this.getExternalSubscriptionId(subscription);
        if (externalSubId) {
            await this.paymentFactory.getProvider().pauseSubscription(externalSubId);
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

        const externalSubId = this.getExternalSubscriptionId(subscription);
        if (externalSubId) {
            await this.paymentFactory.getProvider().resumeSubscription(externalSubId);
        }

        return this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.ACTIVE },
            include: { plan: true },
        });
    }

    async updateUsageQuotasForPlanChange(subscriptionId: string, newPlan: Plan) {
        const newLimits = this.planService.getPlanLimits(newPlan);
        const existingQuotas = await this.prisma.usageQuota.findMany({ where: { subscriptionId } });
        const quotaMap = new Map(existingQuotas.map((q) => [q.metricType, q]));

        for (const [metric, limit] of Object.entries(newLimits)) {
            const metricType = metric as UsageMetricType;
            if (quotaMap.has(metricType)) {
                await this.prisma.usageQuota.update({
                    where: { subscriptionId_metricType: { subscriptionId, metricType } },
                    data: { limit },
                });
            } else {
                await this.prisma.usageQuota.create({
                    data: { subscriptionId, metricType, limit, used: 0, resetAt: this.calculateResetDate() },
                });
            }
        }
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
            throw new NotFoundException('No scheduled change found');
        }

        const externalSubId = this.getExternalSubscriptionId(subscription);
        if (subscription.scheduledChangeType === 'cancel_to_free' && externalSubId) {
            await this.paymentFactory.getProvider().uncancelSubscription(externalSubId);
        }

        const currentVariantId = this.getExternalPlanVariantId(subscription.plan);
        if (subscription.scheduledChangeType === 'downgrade' && externalSubId && currentVariantId) {
            await this.paymentFactory.getProvider().changeSubscriptionPlan(externalSubId, currentVariantId, {
                invoiceImmediately: false,
            });
        }

        return this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                scheduledPlanId: null,
                scheduledChangeAt: null,
                scheduledChangeType: null,
                cancelAtPeriodEnd: false,
            },
            include: { plan: true },
        });
    }

    async purgeUser(userId: string): Promise<number> {
        const subscriptions = await this.prisma.subscription.findMany({
            where: { userId },
            select: { id: true, lemonSqueezySubscriptionId: true, razorpaySubscriptionId: true },
        });

        for (const subscription of subscriptions) {
            const externalSubId = this.getExternalSubscriptionId(subscription);
            if (!externalSubId) continue;
            try {
                await this.paymentFactory.getProvider().cancelSubscriptionImmediately(externalSubId);
            } catch (error) {
                this.logger.warn(`Failed to cancel provider subscription ${externalSubId} for deleted user ${userId}: ${error.message}`);
            }
        }

        await this.prisma.pendingCheckout.deleteMany({ where: { userId } });
        const { count } = await this.prisma.subscription.deleteMany({ where: { userId } });
        return count;
    }

    @Cron(CronExpression.EVERY_6_HOURS)
    async enforceScheduledChanges() {
        const subscriptions = await this.prisma.subscription.findMany({
            where: {
                scheduledChangeAt: { lte: new Date() },
                scheduledPlanId: { not: null },
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
            },
            include: { plan: true },
            take: 100,
        });

        for (const sub of subscriptions) {
            try {
                const newPlan = await this.prisma.plan.findUnique({ where: { id: sub.scheduledPlanId! } });
                if (!newPlan) {
                    this.logger.error(`Scheduled plan ${sub.scheduledPlanId} not found for subscription ${sub.id}`);
                    continue;
                }

                const isCancelToFree = sub.scheduledChangeType === 'cancel_to_free';
                await this.prisma.subscription.update({
                    where: { id: sub.id },
                    data: {
                        planId: newPlan.id,
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
            take: 100,
        });
        if (pending.length === 0) return;

        const razorpay = this.paymentFactory.getProvider() as any;
        for (const checkout of pending) {
            try {
                const rzSub = await razorpay.fetchSubscription(checkout.razorpaySubscriptionId);

                if (['authenticated', 'active'].includes(rzSub.status)) {
                    await this.createSubscription({
                        userId: checkout.userId,
                        planId: checkout.planId,
                        razorpaySubscriptionId: String(rzSub.id),
                        razorpayCustomerId: rzSub.customer_id ? String(rzSub.customer_id) : undefined,
                        currentPeriodStart: rzSub.current_start ? new Date(rzSub.current_start * 1000) : new Date(),
                        currentPeriodEnd: rzSub.current_end
                            ? new Date(rzSub.current_end * 1000)
                            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        status: rzSub.status === 'active' ? SubscriptionStatus.ACTIVE : SubscriptionStatus.TRIALING,
                    });
                    await this.prisma.pendingCheckout.delete({ where: { id: checkout.id } });
                    this.logger.log(`Activated Razorpay subscription ${checkout.razorpaySubscriptionId} for user ${checkout.userId}`);
                } else if (['cancelled', 'expired', 'completed'].includes(rzSub.status)) {
                    await this.prisma.pendingCheckout.delete({ where: { id: checkout.id } });
                    this.logger.warn(`Removed dead pending checkout ${checkout.razorpaySubscriptionId} (status: ${rzSub.status})`);
                } else {
                    await this.prisma.pendingCheckout.update({
                        where: { id: checkout.id },
                        data: { attempts: { increment: 1 } },
                    });
                }
            } catch (error) {
                this.logger.error(`Failed to poll pending checkout ${checkout.razorpaySubscriptionId}:`, error.message);
            }
        }
    }
}

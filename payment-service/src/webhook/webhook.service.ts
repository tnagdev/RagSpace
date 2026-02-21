import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { LemonSqueezyService } from '../providers/lemon-squeezy/lemon-squeezy.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        private prisma: PrismaService,
        private subscriptionService: SubscriptionService,
        private lemonSqueezy: LemonSqueezyService,
    ) { }

    async processWebhook(eventType: string, payload: any): Promise<void> {
        const lemonSqueezyId = payload.meta?.webhook_id || payload.meta?.custom_data?.webhook_id || `${eventType}-${Date.now()}`;

        const existingEvent = await this.prisma.webhookEvent.findUnique({
            where: { lemonSqueezyId },
        });

        if (existingEvent) {
            if (existingEvent.processed) {
                this.logger.log(`Webhook ${lemonSqueezyId} already processed, skipping`);
                return;
            }
            this.logger.log(`Retrying webhook ${lemonSqueezyId}`);
        }

        const webhookEvent = await this.prisma.webhookEvent.upsert({
            where: { lemonSqueezyId },
            create: {
                eventType,
                lemonSqueezyId,
                payload,
                processed: false,
            },
            update: {
                payload,
                updatedAt: new Date(),
            },
        });

        try {
            switch (eventType) {
                case 'order_created':
                    await this.handleOrderCreated(payload);
                    break;

                case 'subscription_created':
                    await this.handleSubscriptionCreated(payload);
                    break;

                case 'subscription_updated':
                    await this.handleSubscriptionUpdated(payload);
                    break;

                case 'subscription_cancelled':
                    await this.handleSubscriptionCancelled(payload);
                    break;

                case 'subscription_resumed':
                    await this.handleSubscriptionResumed(payload);
                    break;

                case 'subscription_expired':
                    await this.handleSubscriptionExpired(payload);
                    break;

                case 'subscription_paused':
                    await this.handleSubscriptionPaused(payload);
                    break;

                case 'subscription_unpaused':
                    await this.handleSubscriptionUnpaused(payload);
                    break;

                case 'subscription_payment_success':
                    await this.handlePaymentSuccess(payload);
                    break;

                case 'subscription_payment_failed':
                    await this.handlePaymentFailed(payload);
                    break;

                default:
                    this.logger.warn(`Unhandled webhook event type: ${eventType}`);
            }

            await this.prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { processed: true, processedAt: new Date() },
            });
        } catch (error) {
            this.logger.error(`Error processing webhook ${eventType}:`, error);
            await this.prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { error: error.message },
            });
            throw error;
        }
    }

    private async handleOrderCreated(payload: any): Promise<void> {
        const { data, meta } = payload;
        const userId = meta?.custom_data?.user_id;

        if (!userId) {
            this.logger.warn('Order created without userId. Meta custom_data:', JSON.stringify(meta?.custom_data));
            return;
        }

        await this.prisma.paymentHistory.create({
            data: {
                userId,
                amount: parseFloat(data.attributes.total),
                currency: data.attributes.currency,
                status: data.attributes.status,
                lemonSqueezyOrderId: data.id,
                description: 'Subscription payment',
                paidAt: new Date(data.attributes.created_at),
            },
        });

        this.logger.log(`Order created for user ${userId}`);
    }

    private async handleSubscriptionCreated(payload: any): Promise<void> {
        const { data, meta } = payload;
        const userId = meta?.custom_data?.user_id;
        const planId = meta?.custom_data?.plan_id;

        if (!userId || !planId) {
            this.logger.warn('Subscription created without userId or planId. Meta custom_data:', JSON.stringify(meta?.custom_data));
            return;
        }

        try {
            await this.subscriptionService.createSubscription({
                userId,
                planId,
                lemonSqueezySubscriptionId: String(data.id),
                lemonSqueezyCustomerId: String(data.attributes.customer_id),
                currentPeriodStart: new Date(data.attributes.created_at),
                currentPeriodEnd: new Date(data.attributes.renews_at),
                status: this.mapLemonSqueezyStatus(data.attributes.status),
            });

            this.logger.log(`Subscription created for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to create subscription for user ${userId}`, error);
            const orderId = data.attributes.first_order_id;
            if (orderId) {
                try {
                    const paymentHistory = await this.prisma.paymentHistory.findFirst({
                        where: { lemonSqueezyOrderId: orderId },
                    });

                    if (paymentHistory) {
                        const refundAmount = Math.round(paymentHistory.amount * 100); // Convert to cents
                        await this.lemonSqueezy.createRefund(orderId, refundAmount);
                        this.logger.log(`Refund of ${refundAmount} cents issued for order ${orderId} due to subscription creation failure`);
                    } else {
                        this.logger.warn(`Payment history not found for order ${orderId} - cannot determine refund amount`);
                    }
                } catch (refundError) {
                    this.logger.error(`Failed to issue refund for order ${orderId}`, refundError);
                }
            } else {
                this.logger.warn(`No order ID found for failed subscription ${data.id} - cannot issue refund`);
            }
            throw error;
        }
    }

    private async handleSubscriptionUpdated(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
            include: { plan: true },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found: ${data.id}`);
            return;
        }

        // If subscription has any pending scheduled change (downgrade, cancel_to_free),
        // only update dates/status — don't process variant changes that would override it
        if (subscription.scheduledChangeType &&
            subscription.scheduledChangeAt &&
            subscription.scheduledChangeAt > new Date()) {
            this.logger.log(`Subscription ${subscription.id} has scheduled ${subscription.scheduledChangeType} at ${subscription.scheduledChangeAt}, preserving — only updating dates, keeping status ACTIVE`);
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    // Keep status ACTIVE — user still has access until period end.
                    // LS sends "cancelled" status but we must not apply it yet or
                    // getUserSubscription (which filters by ACTIVE/TRIALING) returns null.
                    currentPeriodStart: new Date(data.attributes.created_at),
                    currentPeriodEnd: new Date(data.attributes.renews_at),
                },
            });
            return;
        }

        const updates: any = {
            status: this.mapLemonSqueezyStatus(data.attributes.status),
            currentPeriodStart: new Date(data.attributes.created_at),
            currentPeriodEnd: new Date(data.attributes.renews_at),
        };

        const newVariantId = data.attributes.variant_id?.toString();
        if (newVariantId && newVariantId !== subscription.plan.lemonSqueezyVariantId) {
            const newPlan = await this.prisma.plan.findFirst({
                where: { lemonSqueezyVariantId: newVariantId },
            });

            if (newPlan) {
                updates.planId = newPlan.id;
                updates.scheduledPlanId = null;
                updates.scheduledChangeAt = null;
                updates.scheduledChangeType = null;
                this.logger.log(`Plan changed from ${subscription.plan.name} to ${newPlan.name} for subscription ${subscription.id}`);
                await this.subscriptionService.updateUsageQuotasForPlanChange(subscription.id, newPlan);
            }
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: updates,
        });

        this.logger.log(`Subscription updated: ${subscription.id}`);
    }

    private async handleSubscriptionCancelled(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });
        if (!subscription) {
            this.logger.warn(`Subscription not found for cancellation: ${data.id}`);
            return;
        }

        // Check if local cancellation already scheduled the change
        if (subscription.scheduledChangeType === 'cancel_to_free' &&
            subscription.scheduledChangeAt &&
            subscription.scheduledChangeAt > new Date()) {
            this.logger.log(`Subscription ${subscription.id} already has scheduled cancellation at ${subscription.scheduledChangeAt}, webhook ignored to preserve local state`);
            // Don't update anything - preserve local scheduled changes
            return;
        }

        const endsAt = data.attributes.ends_at ? new Date(data.attributes.ends_at) : subscription.currentPeriodEnd;
        const isCancelledAtPeriodEnd = endsAt && endsAt > new Date();
        if (isCancelledAtPeriodEnd) {
            const freePlan = await this.prisma.plan.findFirst({
                where: { type: 'FREE' as any },
            });

            if (!freePlan) {
                this.logger.error('Free plan not found for subscription cancellation');
                return;
            }

            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    cancelAtPeriodEnd: true,
                    canceledAt: new Date(),
                    scheduledPlanId: freePlan.id,
                    scheduledChangeAt: endsAt,
                    scheduledChangeType: 'cancel_to_free'
                },
            });
            this.logger.log(`Subscription ${subscription.id} cancelled at period end. Will transition to free plan on ${endsAt}`);
        } else {
            const freePlan = await this.prisma.plan.findFirst({
                where: { type: 'FREE' as any },
            });

            if (!freePlan) {
                this.logger.error('Free plan not found for subscription cancellation');
                return;
            }

            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    planId: freePlan.id,
                    status: SubscriptionStatus.CANCELLED,
                    canceledAt: new Date(),
                    scheduledPlanId: null,
                    scheduledChangeAt: null,
                    scheduledChangeType: null,
                    lemonSqueezySubscriptionId: null,
                    lemonSqueezyCustomerId: null,
                    lemonSqueezyOrderId: null,
                },
            });
            await this.subscriptionService['updateUsageQuotasForPlanChange'](subscription.id, freePlan);
            this.logger.log(`Subscription ${subscription.id} cancelled immediately and transitioned to free plan`);
        }
    }

    private async handleSubscriptionResumed(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for resume: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: SubscriptionStatus.ACTIVE,
                cancelAtPeriodEnd: false,
            },
        });

        this.logger.log(`Subscription resumed: ${subscription.id}`);
    }

    private async handleSubscriptionExpired(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for expiration: ${data.id}`);
            return;
        }
        const freePlan = await this.prisma.plan.findFirst({
            where: { type: 'FREE' as any },
        });

        if (!freePlan) {
            this.logger.error('Free plan not found for subscription expiration');
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                planId: freePlan.id,
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
        await this.subscriptionService.updateUsageQuotasForPlanChange(subscription.id, freePlan);
        this.logger.log(`Subscription expired and transitioned to free plan: ${subscription.id}`);
    }

    private async handleSubscriptionPaused(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for pause: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAUSED },
        });

        this.logger.log(`Subscription paused: ${subscription.id}`);
    }

    private async handleSubscriptionUnpaused(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for unpause: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.ACTIVE },
        });

        this.logger.log(`Subscription unpaused: ${subscription.id}`);
    }

    private async handlePaymentSuccess(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for payment success: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                lastPaymentDate: new Date(),
                nextPaymentDate: new Date(data.attributes.renews_at),
            },
        });

        await this.prisma.paymentHistory.create({
            data: {
                userId: subscription.userId,
                subscriptionId: subscription.id,
                amount: parseFloat(data.attributes.total),
                currency: data.attributes.currency,
                status: 'paid',
                description: 'Subscription renewal',
                paidAt: new Date(),
            },
        });

        this.logger.log(`Payment succeeded for subscription: ${subscription.id}`);
    }

    private async handlePaymentFailed(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: String(data.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for payment failure: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAST_DUE },
        });

        this.logger.warn(`Payment failed for subscription: ${subscription.id}`);
    }

    private mapLemonSqueezyStatus(lsStatus: string): SubscriptionStatus {
        const statusMap: Record<string, SubscriptionStatus> = {
            active: SubscriptionStatus.ACTIVE,
            cancelled: SubscriptionStatus.CANCELLED,
            expired: SubscriptionStatus.EXPIRED,
            past_due: SubscriptionStatus.PAST_DUE,
            paused: SubscriptionStatus.PAUSED,
            on_trial: SubscriptionStatus.TRIALING,
        };

        return statusMap[lsStatus] || SubscriptionStatus.ACTIVE;
    }
}

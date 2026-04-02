import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentProviderFactory } from '../providers/payment-provider.factory';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        private prisma: PrismaService,
        private subscriptionService: SubscriptionService,
        private paymentFactory: PaymentProviderFactory,
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
                        await this.paymentFactory.getProvider().createRefund(orderId, refundAmount);
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

    // ─── Razorpay webhook entry point ────────────────────────────────────────

    async processRazorpayWebhook(eventType: string, payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        const payment = payload?.payload?.payment?.entity;
        const entityId = sub?.id ?? payment?.id ?? `${eventType}-${Date.now()}`;
        const dedupeKey = `razorpay-${eventType}-${entityId}`;

        const existing = await this.prisma.webhookEvent.findUnique({
            where: { lemonSqueezyId: dedupeKey },
        });

        if (existing?.processed) {
            this.logger.log(`Razorpay webhook ${dedupeKey} already processed, skipping`);
            return;
        }

        const webhookEvent = await this.prisma.webhookEvent.upsert({
            where: { lemonSqueezyId: dedupeKey },
            create: { eventType, lemonSqueezyId: dedupeKey, payload, processed: false },
            update: { payload, updatedAt: new Date() },
        });

        try {
            switch (eventType) {
                case 'subscription.activated':
                case 'subscription.created':
                case 'subscription.authenticated':
                    await this.handleRazorpaySubscriptionActivated(payload);
                    break;

                case 'subscription.charged':
                    await this.handleRazorpaySubscriptionCharged(payload);
                    break;

                case 'subscription.updated':
                    await this.handleRazorpaySubscriptionUpdated(payload);
                    break;

                case 'subscription.cancelled':
                case 'subscription.completed':
                    await this.handleRazorpaySubscriptionCancelled(payload);
                    break;

                case 'subscription.halted':
                    await this.handleRazorpaySubscriptionHalted(payload);
                    break;

                case 'subscription.paused':
                    await this.handleRazorpaySubscriptionPaused(payload);
                    break;

                case 'subscription.resumed':
                    await this.handleRazorpaySubscriptionResumed(payload);
                    break;

                case 'payment.captured':
                    await this.handleRazorpayPaymentCaptured(payload);
                    break;

                case 'payment.failed':
                    await this.handleRazorpayPaymentFailed(payload);
                    break;

                default:
                    this.logger.warn(`Unhandled Razorpay event: ${eventType}`);
            }

            await this.prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { processed: true, processedAt: new Date() },
            });
        } catch (error) {
            this.logger.error(`Error processing Razorpay webhook ${eventType}:`, error);
            await this.prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { error: error.message },
            });
            throw error;
        }
    }

    private async handleRazorpaySubscriptionActivated(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const userId = sub.notes?.user_id;
        const planId = sub.notes?.plan_id;

        if (!userId || !planId) {
            this.logger.warn('Razorpay subscription.activated missing user_id or plan_id in notes');
            return;
        }

        await this.subscriptionService.createSubscription({
            userId,
            planId,
            razorpaySubscriptionId: String(sub.id),
            razorpayCustomerId: sub.customer_id ? String(sub.customer_id) : undefined,
            currentPeriodStart: sub.current_start
                ? new Date(sub.current_start * 1000)
                : new Date(),
            currentPeriodEnd: sub.current_end
                ? new Date(sub.current_end * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: this.mapRazorpayStatus(sub.status),
        });

        // Remove from pending checkouts — webhook arrived, cron fallback no longer needed
        await this.prisma.pendingCheckout.deleteMany({
            where: { razorpaySubscriptionId: String(sub.id) },
        }).catch(() => { /* safe to ignore if record already removed by cron */ });

        this.logger.log(`Razorpay subscription activated for user ${userId}`);
    }

    private async handleRazorpaySubscriptionCharged(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        const payment = payload?.payload?.payment?.entity;
        if (!sub) return;

        let subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
        });
        if (!subscription) {
            const userId = sub.notes?.user_id;
            const planId = sub.notes?.plan_id;

            if (!userId || !planId) {
                this.logger.warn(`Razorpay subscription.charged: no DB record and missing user_id/plan_id in notes for ${sub.id}`);
                return;
            }

            this.logger.log(`Razorpay subscription.charged: creating missing subscription record for ${sub.id}`);
            subscription = await this.subscriptionService.createSubscription({
                userId,
                planId,
                razorpaySubscriptionId: String(sub.id),
                razorpayCustomerId: sub.customer_id ? String(sub.customer_id) : undefined,
                currentPeriodStart: sub.current_start ? new Date(sub.current_start * 1000) : new Date(),
                currentPeriodEnd: sub.current_end
                    ? new Date(sub.current_end * 1000)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                status: SubscriptionStatus.ACTIVE,
            });

            await this.prisma.pendingCheckout.deleteMany({
                where: { razorpaySubscriptionId: String(sub.id) },
            }).catch(() => { /* safe to ignore */ });
        }

        const amount = payment ? payment.amount / 100 : 0;
        const currency = payment?.currency ?? 'INR';

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                lastPaymentDate: new Date(),
                nextPaymentDate: sub.charge_at ? new Date(sub.charge_at * 1000) : undefined,
                currentPeriodStart: sub.current_start ? new Date(sub.current_start * 1000) : undefined,
                currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : undefined,
            },
        });

        if (payment) {
            await this.prisma.paymentHistory.create({
                data: {
                    userId: subscription.userId,
                    subscriptionId: subscription.id,
                    amount,
                    currency,
                    status: 'paid',
                    razorpayPaymentId: String(payment.id),
                    description: 'Subscription renewal',
                    paidAt: new Date(),
                },
            });
        }

        this.logger.log(`Razorpay subscription ${sub.id} charged successfully`);
    }

    private async handleRazorpaySubscriptionUpdated(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
            include: { plan: true },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for Razorpay update: ${sub.id}`);
            return;
        }

        const updates: any = {
            status: this.mapRazorpayStatus(sub.status),
        };

        if (sub.current_start) updates.currentPeriodStart = new Date(sub.current_start * 1000);
        if (sub.current_end) updates.currentPeriodEnd = new Date(sub.current_end * 1000);

        const newPlanId = sub.plan_id?.toString();
        if (newPlanId && newPlanId !== subscription.plan.razorpayPlanId) {
            const newPlan = await this.prisma.plan.findFirst({
                where: { razorpayPlanId: newPlanId },
            });

            if (newPlan) {
                updates.planId = newPlan.id;
                updates.scheduledPlanId = null;
                updates.scheduledChangeAt = null;
                updates.scheduledChangeType = null;
                await this.subscriptionService.updateUsageQuotasForPlanChange(subscription.id, newPlan);
                this.logger.log(`Razorpay plan changed for subscription ${subscription.id}`);
            }
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: updates,
        });

        this.logger.log(`Razorpay subscription updated: ${subscription.id}`);
    }

    private async handleRazorpaySubscriptionCancelled(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found for Razorpay cancellation: ${sub.id}`);
            return;
        }

        const freePlan = await this.prisma.plan.findFirst({ where: { type: 'FREE' as any } });
        if (!freePlan) {
            this.logger.error('Free plan not found for Razorpay subscription cancellation');
            return;
        }

        const endsAt = sub.ended_at ? new Date(sub.ended_at * 1000) : subscription.currentPeriodEnd;
        const isFuture = endsAt && endsAt > new Date();

        if (isFuture) {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    cancelAtPeriodEnd: true,
                    canceledAt: new Date(),
                    scheduledPlanId: freePlan.id,
                    scheduledChangeAt: endsAt,
                    scheduledChangeType: 'cancel_to_free',
                },
            });
            this.logger.log(`Razorpay subscription ${subscription.id} scheduled for cancellation at period end`);
        } else {
            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    planId: freePlan.id,
                    status: SubscriptionStatus.CANCELLED,
                    canceledAt: new Date(),
                    scheduledPlanId: null,
                    scheduledChangeAt: null,
                    scheduledChangeType: null,
                    razorpaySubscriptionId: null,
                    razorpayCustomerId: null,
                },
            });
            await this.subscriptionService['updateUsageQuotasForPlanChange'](subscription.id, freePlan);
            this.logger.log(`Razorpay subscription ${subscription.id} cancelled immediately`);
        }
    }

    private async handleRazorpaySubscriptionHalted(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAST_DUE },
        });

        this.logger.warn(`Razorpay subscription halted (past due): ${subscription.id}`);
    }

    private async handleRazorpaySubscriptionPaused(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAUSED },
        });

        this.logger.log(`Razorpay subscription paused: ${subscription.id}`);
    }

    private async handleRazorpaySubscriptionResumed(payload: any): Promise<void> {
        const sub = payload?.payload?.subscription?.entity;
        if (!sub) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(sub.id) },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: false },
        });

        this.logger.log(`Razorpay subscription resumed: ${subscription.id}`);
    }

    private async handleRazorpayPaymentCaptured(payload: any): Promise<void> {
        const payment = payload?.payload?.payment?.entity;
        if (!payment) return;

        const userId = payment.notes?.user_id;
        if (!userId) {
            this.logger.warn('Razorpay payment.captured missing user_id in notes');
            return;
        }

        await this.prisma.paymentHistory.create({
            data: {
                userId,
                amount: payment.amount / 100,
                currency: payment.currency ?? 'INR',
                status: payment.status,
                razorpayOrderId: payment.order_id ? String(payment.order_id) : undefined,
                razorpayPaymentId: String(payment.id),
                description: 'Subscription payment',
                paidAt: new Date(),
            },
        });

        this.logger.log(`Razorpay payment captured for user ${userId}`);
    }

    private async handleRazorpayPaymentFailed(payload: any): Promise<void> {
        const payment = payload?.payload?.payment?.entity;
        if (!payment?.subscription_id) return;

        const subscription = await this.prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: String(payment.subscription_id) },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAST_DUE },
        });

        this.logger.warn(`Razorpay payment failed for subscription: ${subscription.id}`);
    }

    private mapRazorpayStatus(rzStatus: string): SubscriptionStatus {
        const statusMap: Record<string, SubscriptionStatus> = {
            created: SubscriptionStatus.ACTIVE,
            authenticated: SubscriptionStatus.ACTIVE,
            active: SubscriptionStatus.ACTIVE,
            pending: SubscriptionStatus.ACTIVE,
            halted: SubscriptionStatus.PAST_DUE,
            cancelled: SubscriptionStatus.CANCELLED,
            completed: SubscriptionStatus.EXPIRED,
            expired: SubscriptionStatus.EXPIRED,
            paused: SubscriptionStatus.PAUSED,
        };

        return statusMap[rzStatus] ?? SubscriptionStatus.ACTIVE;
    }
}


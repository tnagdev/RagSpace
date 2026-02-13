import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        private prisma: PrismaService,
        private subscriptionService: SubscriptionService,
    ) { }

    async processWebhook(eventType: string, payload: any): Promise<void> {
        // Store webhook event
        const webhookEvent = await this.prisma.webhookEvent.create({
            data: {
                eventType,
                lemonSqueezyId: payload.meta?.event_name || payload.id,
                payload,
                processed: false,
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

            // Mark as processed
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
        const { data } = payload;
        const userId = data.attributes.custom_data?.userId;

        if (!userId) {
            this.logger.warn('Order created without userId');
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
        const { data } = payload;
        const userId = data.attributes.custom_data?.userId;
        const planId = data.attributes.custom_data?.planId;

        if (!userId || !planId) {
            this.logger.warn('Subscription created without userId or planId');
            return;
        }

        await this.subscriptionService.createSubscription({
            userId,
            planId,
            lemonSqueezySubscriptionId: data.id,
            lemonSqueezyCustomerId: data.attributes.customer_id,
            currentPeriodStart: new Date(data.attributes.current_period_start),
            currentPeriodEnd: new Date(data.attributes.current_period_end),
            status: this.mapLemonSqueezyStatus(data.attributes.status),
        });

        this.logger.log(`Subscription created for user ${userId}`);
    }

    private async handleSubscriptionUpdated(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) {
            this.logger.warn(`Subscription not found: ${data.id}`);
            return;
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: this.mapLemonSqueezyStatus(data.attributes.status),
                currentPeriodStart: new Date(data.attributes.current_period_start),
                currentPeriodEnd: new Date(data.attributes.current_period_end),
            },
        });

        this.logger.log(`Subscription updated: ${subscription.id}`);
    }

    private async handleSubscriptionCancelled(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: SubscriptionStatus.CANCELLED,
                canceledAt: new Date(),
            },
        });

        this.logger.log(`Subscription cancelled: ${subscription.id}`);
    }

    private async handleSubscriptionResumed(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

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
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.EXPIRED },
        });

        this.logger.log(`Subscription expired: ${subscription.id}`);
    }

    private async handleSubscriptionPaused(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.PAUSED },
        });

        this.logger.log(`Subscription paused: ${subscription.id}`);
    }

    private async handleSubscriptionUnpaused(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: SubscriptionStatus.ACTIVE },
        });

        this.logger.log(`Subscription unpaused: ${subscription.id}`);
    }

    private async handlePaymentSuccess(payload: any): Promise<void> {
        const { data } = payload;
        const subscription = await this.prisma.subscription.findUnique({
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

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
            where: { lemonSqueezySubscriptionId: data.id },
        });

        if (!subscription) return;

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

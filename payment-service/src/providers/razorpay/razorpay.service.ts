import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay = require('razorpay');
import { createHmac } from 'crypto';
import {
    IPaymentProvider,
    CheckoutParams,
    CheckoutResult,
    PlanChangeOptions,
} from '../payment-provider.interface';

@Injectable()
export class RazorpayService implements IPaymentProvider {
    private readonly logger = new Logger(RazorpayService.name);
    private client: Razorpay;
    private readonly frontendUrl: string;

    constructor(private configService: ConfigService) {
        const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
        const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

        if (!keyId || !keySecret) {
            this.logger.warn('Razorpay credentials not configured');
            return;
        }

        this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
        this.logger.log('✅ Razorpay initialized');
    }

    getProviderName(): string {
        return 'razorpay';
    }

    async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
        try {
            const subscription = await this.client.subscriptions.create({
                plan_id: params.variantId,
                total_count: 12,
                customer_notify: 1,
                notes: {
                    user_id: params.userId,
                    ...params.customData,
                },
                notify_info: {
                    notify_email: params.userEmail,
                } as any,
            } as any);

            const checkoutUrl = (subscription as any).short_url;
            if (!checkoutUrl) {
                throw new Error('Razorpay did not return a checkout URL');
            }

            this.logger.log(`Razorpay subscription created: ${subscription.id}`);
            return { checkoutUrl, providerSubscriptionId: subscription.id };
        } catch (error) {
            this.logger.error('Failed to create Razorpay checkout', error);
            throw error;
        }
    }

    async fetchSubscription(subscriptionId: string): Promise<any> {
        try {
            return await this.client.subscriptions.fetch(subscriptionId);
        } catch (error) {
            this.logger.error(`Failed to fetch Razorpay subscription ${subscriptionId}`, error);
            throw error;
        }
    }

    async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<any> {
        try {
            const result = await this.client.subscriptions.cancel(subscriptionId, true);
            this.logger.log(`Razorpay subscription ${subscriptionId} scheduled for cancellation at period end`);
            return result;
        } catch (error) {
            this.logger.error('Failed to cancel Razorpay subscription at period end', error);
            throw error;
        }
    }

    async cancelSubscriptionImmediately(subscriptionId: string): Promise<any> {
        try {
            const result = await this.client.subscriptions.cancel(subscriptionId, false);
            this.logger.log(`Razorpay subscription ${subscriptionId} cancelled immediately`);
            return result;
        } catch (error) {
            this.logger.error('Failed to cancel Razorpay subscription immediately', error);
            throw error;
        }
    }

    async uncancelSubscription(subscriptionId: string): Promise<any> {
        try {
            const result = await this.client.subscriptions.update(subscriptionId, {
                cancel_at_cycle_end: 0,
            } as any);
            this.logger.log(`Razorpay subscription ${subscriptionId} period-end cancellation reversed`);
            return result;
        } catch (error) {
            const reason = error?.error?.description ?? error?.message ?? 'unknown reason';
            this.logger.log(
                `Razorpay period-end cancellation reversal skipped for ${subscriptionId} ` +
                `(${reason}). DB state updated — user access is preserved until period end.`,
            );
        }
    }

    async pauseSubscription(subscriptionId: string): Promise<any> {
        try {
            const result = await this.client.subscriptions.pause(subscriptionId, {
                pause_at: 'now',
            });
            this.logger.log(`Razorpay subscription ${subscriptionId} paused`);
            return result;
        } catch (error) {
            this.logger.error('Failed to pause Razorpay subscription', error);
            throw error;
        }
    }

    async resumeSubscription(subscriptionId: string): Promise<any> {
        try {
            const result = await this.client.subscriptions.resume(subscriptionId, {
                resume_at: 'now',
            });
            this.logger.log(`Razorpay subscription ${subscriptionId} resumed`);
            return result;
        } catch (error) {
            this.logger.error('Failed to resume Razorpay subscription', error);
            throw error;
        }
    }

    async changeSubscriptionPlan(
        subscriptionId: string,
        newPlanId: string,
        options?: PlanChangeOptions,
    ): Promise<any> {
        try {
            const result = await this.client.subscriptions.update(subscriptionId, {
                plan_id: newPlanId,
                ...(options?.invoiceImmediately && { prorate: true }),
            } as any);
            this.logger.log(`Razorpay subscription ${subscriptionId} plan changed to ${newPlanId}`);
            return result;
        } catch (error) {
            this.logger.error('Failed to change Razorpay subscription plan', error);
            throw error;
        }
    }

    verifyWebhookSignature(signature: string, payload: string): boolean {
        const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');

        if (!secret) {
            this.logger.warn('Razorpay webhook secret not configured');
            return false;
        }

        const expectedSignature = createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return expectedSignature === signature;
    }

    async createRefund(paymentId: string, amount?: number, reason?: string): Promise<any> {
        try {
            this.logger.log(`Creating Razorpay refund for payment ${paymentId}. Amount: ${amount ?? 'full'}`);

            const refundParams: any = {};
            if (amount) {
                refundParams.amount = amount;
            }
            if (reason) {
                refundParams.notes = { reason };
            }

            const refund = await this.client.payments.refund(paymentId, refundParams);
            this.logger.log(`Razorpay refund created for payment ${paymentId}`, refund.id);
            return refund;
        } catch (error) {
            this.logger.error(`Failed to create Razorpay refund for payment ${paymentId}`, error);
            throw error;
        }
    }
}

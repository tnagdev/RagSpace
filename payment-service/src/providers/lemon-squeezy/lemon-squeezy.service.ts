import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPaymentProvider, CheckoutParams, PlanChangeOptions } from '../payment-provider.interface';
import {
    lemonSqueezySetup,
    createCheckout,
    getSubscription,
    updateSubscription,
    cancelSubscription,
    getCustomer,
    listProducts,
    listVariants,
    issueOrderRefund,
} from '@lemonsqueezy/lemonsqueezy.js';

@Injectable()
export class LemonSqueezyService implements IPaymentProvider {
    private readonly logger = new Logger(LemonSqueezyService.name);
    private readonly storeId: string;
    private readonly frontendUrl: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('LEMON_SQUEEZY_API_KEY');
        this.storeId = this.configService.get<string>('LEMON_SQUEEZY_STORE_ID');
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

        if (!apiKey) {
            this.logger.warn('Lemon Squeezy API key not configured');
            return;
        }

        lemonSqueezySetup({ apiKey });
        this.logger.log('✅ Lemon Squeezy initialized');
    }

    getProviderName(): string {
        return 'lemon-squeezy';
    }

    async createCheckoutSession(params: CheckoutParams): Promise<import('../payment-provider.interface').CheckoutResult> {
        try {
            // Redirect to files page with payment status query params
            const successUrl = `${this.frontendUrl}/files?payment=success`;

            const checkout = await createCheckout(this.storeId, params.variantId, {
                checkoutData: {
                    email: params.userEmail,
                    custom: {
                        user_id: params.userId,  // Use snake_case to match webhook payload
                        ...params.customData,
                    },
                },
                checkoutOptions: {
                    embed: false,
                    media: true,
                    logo: true,
                    desc: true,
                    discount: true,
                    dark: false,
                    subscriptionPreview: true,
                },
                productOptions: {
                    redirectUrl: successUrl,
                },
                expiresAt: null,
                preview: false,
                testMode: false,
            });

            const checkoutUrl = checkout.data.data.attributes.url;
            if (!checkoutUrl || typeof checkoutUrl !== 'string') {
                this.logger.error('Invalid checkout URL received', checkout.data);
                throw new Error('Failed to get valid checkout URL');
            }

            this.logger.log(`Checkout URL created. Redirect URL: ${successUrl}`);

            return { checkoutUrl };
        } catch (error) {
            this.logger.error('Failed to create checkout', error);
            throw error;
        }
    }

    async getSubscriptionDetails(subscriptionId: string) {
        try {
            const subscription = await getSubscription(subscriptionId);
            return subscription.data;
        } catch (error) {
            this.logger.error('Failed to get subscription', error);
            throw error;
        }
    }

    async pauseSubscription(subscriptionId: string) {
        try {
            const result = await updateSubscription(subscriptionId, {
                pause: {
                    mode: 'void',
                },
            });
            return result.data;
        } catch (error) {
            this.logger.error('Failed to pause subscription', error);
            throw error;
        }
    }

    async resumeSubscription(subscriptionId: string) {
        try {
            const result = await updateSubscription(subscriptionId, {
                pause: null,
            });
            return result.data;
        } catch (error) {
            this.logger.error('Failed to resume subscription', error);
            throw error;
        }
    }

    async cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
        try {
            const result = await updateSubscription(subscriptionId, {
                cancelled: true,
            });
            return result.data;
        } catch (error) {
            this.logger.error('Failed to cancel subscription', error);
            throw error;
        }
    }

    async cancelSubscriptionImmediately(subscriptionId: string) {
        try {
            const result = await cancelSubscription(subscriptionId);
            return result.data;
        } catch (error) {
            this.logger.error('Failed to cancel subscription immediately', error);
            throw error;
        }
    }

    async uncancelSubscription(subscriptionId: string) {
        try {
            const result = await updateSubscription(subscriptionId, {
                cancelled: false,
            });
            return result.data;
        } catch (error) {
            this.logger.error('Failed to uncancel LemonSqueezy subscription', error);
            throw error;
        }
    }

    async changeSubscriptionPlan(
        subscriptionId: string,
        newVariantId: string,
        options?: PlanChangeOptions,
    ) {
        try {
            const result = await updateSubscription(subscriptionId, {
                variantId: parseInt(newVariantId),
                ...options,
            });
            return result.data;
        } catch (error) {
            this.logger.error('Failed to change subscription plan', error);
            throw error;
        }
    }

    async getCustomerDetails(customerId: string) {
        try {
            const customer = await getCustomer(customerId);
            return customer.data;
        } catch (error) {
            this.logger.error('Failed to get customer', error);
            throw error;
        }
    }

    async listAllProducts() {
        try {
            const products = await listProducts({ filter: { storeId: this.storeId } });
            return products.data;
        } catch (error) {
            this.logger.error('Failed to list products', error);
            throw error;
        }
    }

    async listProductVariants(productId: string) {
        try {
            const variants = await listVariants({ filter: { productId } });
            return variants.data;
        } catch (error) {
            this.logger.error('Failed to list variants', error);
            throw error;
        }
    }

    verifyWebhookSignature(signature: string, payload: string): boolean {
        const crypto = require('crypto');
        const secret = this.configService.get<string>('LEMON_SQUEEZY_WEBHOOK_SECRET');

        if (!secret) {
            this.logger.warn('Webhook secret not configured');
            return false;
        }

        const hash = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return hash === signature;
    }

    async createRefund(orderId: string, amount?: number, reason?: string) {
        try {
            this.logger.log(`Creating refund for order ${orderId}. Amount: ${amount || 'full'}, Reason: ${reason || 'N/A'}`);
            if (!amount) {
                this.logger.warn(`Full refund requested for order ${orderId}, but amount is required. Attempting full refund by not specifying amount.`);
            }
            const refund = await issueOrderRefund(orderId, amount!);
            this.logger.log(`Refund created successfully for order ${orderId}`, refund.data);
            return refund.data;
        } catch (error) {
            this.logger.error(`Failed to create refund for order ${orderId}`, error);
            throw error;
        }
    }
}

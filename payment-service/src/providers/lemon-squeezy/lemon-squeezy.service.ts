import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    lemonSqueezySetup,
    createCheckout,
    getSubscription,
    updateSubscription,
    cancelSubscription,
    getCustomer,
    listProducts,
    listVariants,
} from '@lemonsqueezy/lemonsqueezy.js';

@Injectable()
export class LemonSqueezyService {
    private readonly logger = new Logger(LemonSqueezyService.name);
    private readonly storeId: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('LEMON_SQUEEZY_API_KEY');
        this.storeId = this.configService.get<string>('LEMON_SQUEEZY_STORE_ID');

        if (!apiKey) {
            this.logger.warn('Lemon Squeezy API key not configured');
            return;
        }

        lemonSqueezySetup({ apiKey });
        this.logger.log('✅ Lemon Squeezy initialized');
    }

    async createCheckoutSession(params: {
        variantId: string;
        userId: string;
        userEmail: string;
        customData?: Record<string, any>;
    }) {
        try {
            const checkout = await createCheckout(this.storeId, params.variantId, {
                checkoutData: {
                    email: params.userEmail,
                    custom: {
                        userId: params.userId,
                        ...params.customData,
                    },
                },
            });

            return checkout.data;
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

    async changeSubscriptionPlan(subscriptionId: string, newVariantId: string) {
        try {
            const result = await updateSubscription(subscriptionId, {
                variantId: parseInt(newVariantId),
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
}

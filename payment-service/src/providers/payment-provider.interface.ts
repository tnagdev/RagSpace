import { timingSafeEqual } from 'crypto';

export interface CheckoutParams {
    variantId: string;
    userId: string;
    userEmail: string;
    customData?: Record<string, any>;
}

export interface CheckoutResult {
    checkoutUrl: string;
    providerSubscriptionId?: string;
}

export interface PlanChangeOptions {
    invoiceImmediately?: boolean;
    disableProrations?: boolean;
}

export interface IPaymentProvider {
    getProviderName(): string;

    createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;

    cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<any>;

    cancelSubscriptionImmediately(subscriptionId: string): Promise<any>;

    uncancelSubscription(subscriptionId: string): Promise<any>;

    pauseSubscription(subscriptionId: string): Promise<any>;

    resumeSubscription(subscriptionId: string): Promise<any>;

    changeSubscriptionPlan(
        subscriptionId: string,
        newVariantId: string,
        options?: PlanChangeOptions,
    ): Promise<any>;

    verifyWebhookSignature(signature: string, payload: Buffer): boolean;

    createRefund(transactionId: string, amount?: number, reason?: string): Promise<any>;
}

export function signaturesMatch(expectedHex: string, received: string | undefined): boolean {
    if (!received) return false;
    const expected = Buffer.from(expectedHex, 'utf8');
    const actual = Buffer.from(received, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

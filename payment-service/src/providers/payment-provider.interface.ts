export interface CheckoutParams {
    variantId: string; // Provider-specific plan/variant ID
    userId: string;
    userEmail: string;
    customData?: Record<string, any>;
}

export interface CheckoutResult {
    checkoutUrl: string;
    providerSubscriptionId?: string; // Razorpay subscription ID returned at checkout time
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

    verifyWebhookSignature(signature: string, payload: string): boolean;

    createRefund(transactionId: string, amount?: number, reason?: string): Promise<any>;
}

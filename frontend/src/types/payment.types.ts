export enum PlanType {
    FREE = 'FREE',
    BASIC = 'BASIC',
    PRO = 'PRO',
}

export enum PlanInterval {
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

export enum SubscriptionStatus {
    ACTIVE = 'ACTIVE',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
    PAST_DUE = 'PAST_DUE',
    PAUSED = 'PAUSED',
    TRIALING = 'TRIALING',
}

export enum UsageMetricType {
    CONVERSATIONS = 'CONVERSATIONS',
    STORAGE = 'STORAGE',
    FILE_CONVERSATIONS = 'FILE_CONVERSATIONS',
    YOUTUBE_VIDEOS = 'YOUTUBE_VIDEOS',
    MAX_VIDEO_LENGTH = 'MAX_VIDEO_LENGTH',
    MAX_AUDIO_DURATION = 'MAX_AUDIO_DURATION',
}

export interface PlanLimits {
    [UsageMetricType.CONVERSATIONS]?: number;
    [UsageMetricType.STORAGE]?: number;
    [UsageMetricType.FILE_CONVERSATIONS]?: number;
    [UsageMetricType.YOUTUBE_VIDEOS]?: number;
    [UsageMetricType.MAX_VIDEO_LENGTH]?: number;
    [UsageMetricType.MAX_AUDIO_DURATION]?: number;
}

export interface Plan {
    id: string;
    name: string;
    description?: string;
    type: PlanType;
    interval: PlanInterval;
    price: number;
    priceUnit: string;
    isActive: boolean;
    lemonSqueezyVariantId?: string;
    lemonSqueezyProductId?: string;
    limits: PlanLimits;
    features: string[];
    createdAt: string;
    updatedAt: string;
}

export interface Subscription {
    id: string;
    userId: string;
    planId: string;
    status: SubscriptionStatus;
    lemonSqueezySubscriptionId?: string;
    lemonSqueezyCustomerId?: string;
    lemonSqueezyOrderId?: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    canceledAt?: string;
    trialStart?: string;
    trialEnd?: string;
    lastPaymentDate?: string;
    nextPaymentDate?: string;
    createdAt: string;
    updatedAt: string;
    plan: Plan;
}

export interface UsageQuota {
    id: string;
    subscriptionId: string;
    metric: UsageMetricType;
    limit: number;
    used: number;
    resetAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UsageStats {
    subscription: Subscription;
    quotas: UsageQuota[];
}

export interface CheckoutSession {
    checkoutUrl: string;
}

export interface UsageErrorData {
    statusCode: number;
    message: string;
    error: string;
    metricType?: UsageMetricType;
    currentUsage?: number;
    limit?: number;
}

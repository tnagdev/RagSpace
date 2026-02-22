import { privateAxios, publicAxios } from './apiClient';
import type {
    Plan,
    Subscription,
    UsageStats,
    CheckoutSession,
} from '@/types/payment.types';

const PAYMENT_BASE = '/api';

export const paymentAPI = {
    // Plans
    getPlans: async (): Promise<Plan[]> => {
        const response = await publicAxios.get<Plan[]>(`${PAYMENT_BASE}/plans`);
        return response.data;
    },

    getPlansWithComparison: async (): Promise<Plan[]> => {
        const response = await publicAxios.get<Plan[]>(`${PAYMENT_BASE}/plans/with-comparison`);
        return response.data;
    },

    getPlanById: async (id: string): Promise<Plan> => {
        const response = await publicAxios.get<Plan>(`${PAYMENT_BASE}/plans/${id}`);
        return response.data;
    },

    // Subscriptions
    getCurrentSubscription: async (): Promise<Subscription | null> => {
        const response = await privateAxios.get<Subscription | null>(
            `${PAYMENT_BASE}/subscriptions/current`
        );
        return response.data;
    },

    getUsageStats: async (): Promise<UsageStats> => {
        const response = await privateAxios.get<UsageStats>(
            `${PAYMENT_BASE}/subscriptions/usage`
        );
        return response.data;
    },

    createCheckout: async (planId: string): Promise<CheckoutSession> => {
        const response = await privateAxios.post<CheckoutSession>(
            `${PAYMENT_BASE}/subscriptions/checkout`,
            { planId }
        );
        return response.data;
    },

    upgradeSubscription: async (planId: string): Promise<Subscription> => {
        const response = await privateAxios.patch<Subscription>(
            `${PAYMENT_BASE}/subscriptions/upgrade`,
            { planId }
        );
        return response.data;
    },

    downgradeSubscription: async (planId: string): Promise<Subscription> => {
        const response = await privateAxios.patch<Subscription>(
            `${PAYMENT_BASE}/subscriptions/downgrade`,
            { planId }
        );
        return response.data;
    },

    cancelSubscription: async (immediate: boolean = false): Promise<Subscription> => {
        const response = await privateAxios.delete<Subscription>(
            `${PAYMENT_BASE}/subscriptions/cancel`,
            { data: { immediate } }
        );
        return response.data;
    },

    pauseSubscription: async (): Promise<Subscription> => {
        const response = await privateAxios.patch<Subscription>(
            `${PAYMENT_BASE}/subscriptions/pause`
        );
        return response.data;
    },

    resumeSubscription: async (): Promise<Subscription> => {
        const response = await privateAxios.patch<Subscription>(
            `${PAYMENT_BASE}/subscriptions/resume`
        );
        return response.data;
    },

    cancelScheduledChange: async (): Promise<Subscription> => {
        const response = await privateAxios.delete<Subscription>(
            `${PAYMENT_BASE}/subscriptions/scheduled-change`
        );
        return response.data;
    },
};

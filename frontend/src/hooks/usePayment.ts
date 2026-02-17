import {
    useQuery,
    useMutation,
    useQueryClient,
    type UseQueryOptions,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { paymentAPI } from '@/api/payment';
import type {
    Plan,
    Subscription,
    UsageStats,
    CheckoutSession,
} from '@/types/payment.types';

export const paymentKeys = {
    all: ['payment'] as const,
    plans: () => [...paymentKeys.all, 'plans'] as const,
    plan: (id: string) => [...paymentKeys.plans(), id] as const,
    subscription: () => [...paymentKeys.all, 'subscription'] as const,
    usage: () => [...paymentKeys.all, 'usage'] as const,
};

// Plans
export const usePlans = (
    options?: Omit<UseQueryOptions<Plan[], Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: paymentKeys.plans(),
        queryFn: paymentAPI.getPlans,
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    });
};

export const usePlan = (
    id: string,
    options?: Omit<UseQueryOptions<Plan, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: paymentKeys.plan(id),
        queryFn: () => paymentAPI.getPlanById(id),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
        ...options,
    });
};

// Subscription
export const useSubscription = (
    options?: Omit<UseQueryOptions<Subscription | null, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: paymentKeys.subscription(),
        queryFn: paymentAPI.getCurrentSubscription,
        staleTime: 1 * 60 * 1000, // 1 minute
        ...options,
    });
};

// Usage Stats
export const useUsageStats = (
    options?: Omit<UseQueryOptions<UsageStats, Error>, 'queryKey' | 'queryFn'>
) => {
    return useQuery({
        queryKey: paymentKeys.usage(),
        queryFn: paymentAPI.getUsageStats,
        staleTime: 30 * 1000, // 30 seconds
        ...options,
    });
};

// Create Checkout
export const useCreateCheckout = (
    options?: UseMutationOptions<CheckoutSession, Error, string>
) => {
    return useMutation({
        mutationFn: paymentAPI.createCheckout,
        ...options,
    });
};

// Upgrade Subscription
export const useUpgradeSubscription = (
    options?: UseMutationOptions<Subscription, Error, string>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: paymentAPI.upgradeSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
            queryClient.invalidateQueries({ queryKey: paymentKeys.usage() });
        },
        ...options,
    });
};

// Downgrade Subscription
export const useDowngradeSubscription = (
    options?: UseMutationOptions<Subscription, Error, string>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: paymentAPI.downgradeSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
            queryClient.invalidateQueries({ queryKey: paymentKeys.usage() });
        },
        ...options,
    });
};

// Cancel Subscription
export const useCancelSubscription = (
    options?: UseMutationOptions<Subscription, Error, boolean>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: paymentAPI.cancelSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
            queryClient.invalidateQueries({ queryKey: paymentKeys.usage() });
        },
        ...options,
    });
};

// Pause Subscription
export const usePauseSubscription = (
    options?: UseMutationOptions<Subscription, Error, void>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: paymentAPI.pauseSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
        },
        ...options,
    });
};

// Resume Subscription
export const useResumeSubscription = (
    options?: UseMutationOptions<Subscription, Error, void>
) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: paymentAPI.resumeSubscription,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
        },
        ...options,
    });
};

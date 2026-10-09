import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingAPI } from '@/api/billing';
import type { ChangePlanResult, Subscription } from '@/api/types';

export const paymentKeys = {
    all: ['billing'] as const,
    plans: () => [...paymentKeys.all, 'plans'] as const,
    subscription: () => [...paymentKeys.all, 'subscription'] as const,
};

export const usageKeys = {
    all: ['usage'] as const,
};

function refreshBilling(queryClient: QueryClient) {
    queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    queryClient.invalidateQueries({ queryKey: usageKeys.all });
}

// Plans carry a comparison against the caller's plan, so the cache is per-session.
export const usePlans = () => useQuery({ queryKey: paymentKeys.plans(), queryFn: billingAPI.plans, staleTime: 5 * 60_000 });

export const useSubscription = () =>
    useQuery({ queryKey: paymentKeys.subscription(), queryFn: billingAPI.subscription, staleTime: 60_000 });

export const useUsage = () => useQuery({ queryKey: usageKeys.all, queryFn: billingAPI.usage, staleTime: 30_000 });

export const useChangePlan = () => {
    const queryClient = useQueryClient();
    return useMutation<ChangePlanResult, Error, string>({
        mutationFn: (planId) => billingAPI.changePlan(planId),
        onSuccess: (result) => {
            if (!result.checkoutUrl) refreshBilling(queryClient);
        },
    });
};

function useSubscriptionMutation<TArgs = void>(fn: (args: TArgs) => Promise<Subscription>) {
    const queryClient = useQueryClient();
    return useMutation<Subscription, Error, TArgs>({
        mutationFn: fn,
        onSuccess: (subscription) => {
            queryClient.setQueryData(paymentKeys.subscription(), subscription);
            refreshBilling(queryClient);
        },
    });
}

export const useCancelSubscription = () => useSubscriptionMutation((immediate: boolean) => billingAPI.cancel(immediate));
export const usePauseSubscription = () => useSubscriptionMutation(() => billingAPI.pause());
export const useResumeSubscription = () => useSubscriptionMutation(() => billingAPI.resume());
export const useCancelScheduledChange = () => useSubscriptionMutation(() => billingAPI.cancelScheduledChange());

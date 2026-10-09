import { billingV1, commonV1, fromProtoEnum, toProtoEnum } from '@ragspace/shared-ts';
import { Plan, PlanType, UsageMetricType, UsageQuota } from '@prisma/client';
import type { SubscriptionWithPlan } from '../subscription/subscription.service';

const SCHEDULED_KINDS: Record<string, billingV1.ScheduledChangeKind> = {
    downgrade: billingV1.ScheduledChangeKind.SCHEDULED_CHANGE_KIND_DOWNGRADE,
    cancel_to_free: billingV1.ScheduledChangeKind.SCHEDULED_CHANGE_KIND_CANCEL_TO_FREE,
};

export function toProtoPlan(plan: Plan, comparison = billingV1.PlanComparison.PLAN_COMPARISON_UNSPECIFIED): billingV1.Plan {
    const limits = Object.entries((plan.limits ?? {}) as Record<string, number>).map(([metric, limit]) => ({
        metric: toProtoEnum<commonV1.UsageMetric>('USAGE_METRIC', metric),
        limit: Number(limit),
    }));
    return {
        id: plan.id,
        name: plan.name,
        description: plan.description ?? undefined,
        type: toProtoEnum<billingV1.PlanType>('PLAN_TYPE', plan.type),
        interval: toProtoEnum<billingV1.BillingInterval>('BILLING_INTERVAL', plan.interval),
        price: { amountMinor: Math.round(plan.price * 100), currency: plan.priceUnit },
        limits,
        features: plan.features,
        comparison,
    };
}

export function toProtoSubscription(subscription: SubscriptionWithPlan): billingV1.Subscription {
    const scheduledKind = subscription.scheduledChangeType ? SCHEDULED_KINDS[subscription.scheduledChangeType] : undefined;
    return {
        id: subscription.id,
        userId: subscription.userId,
        plan: toProtoPlan(subscription.plan, billingV1.PlanComparison.PLAN_COMPARISON_CURRENT),
        status: toProtoEnum<billingV1.SubscriptionStatus>('SUBSCRIPTION_STATUS', subscription.status),
        currentPeriodStartTime: subscription.currentPeriodStart,
        currentPeriodEndTime: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelTime: subscription.canceledAt ?? undefined,
        trialEndTime: subscription.trialEnd ?? undefined,
        scheduledChange:
            scheduledKind && subscription.scheduledPlanId && subscription.scheduledChangeAt
                ? { kind: scheduledKind, planId: subscription.scheduledPlanId, effectiveTime: subscription.scheduledChangeAt }
                : undefined,
        nextPaymentTime: subscription.nextPaymentDate ?? undefined,
        createTime: subscription.createdAt,
        updateTime: subscription.updatedAt,
    };
}

export function toProtoQuota(quota: UsageQuota): billingV1.QuotaUsage {
    return {
        metric: toProtoEnum<commonV1.UsageMetric>('USAGE_METRIC', quota.metricType),
        used: Number(quota.used),
        limit: Number(quota.limit),
        resetTime: quota.resetAt ?? undefined,
    };
}

export function comparePlanTypes(
    current: PlanType | undefined,
    candidate: PlanType,
    compare: (a: PlanType, b: PlanType) => number,
): billingV1.PlanComparison {
    if (!current) return billingV1.PlanComparison.PLAN_COMPARISON_UNSPECIFIED;
    const order = compare(candidate, current);
    if (order === 0) return billingV1.PlanComparison.PLAN_COMPARISON_CURRENT;
    return order > 0
        ? billingV1.PlanComparison.PLAN_COMPARISON_UPGRADE
        : billingV1.PlanComparison.PLAN_COMPARISON_DOWNGRADE;
}

export function toMetric(metric: commonV1.UsageMetric): UsageMetricType | undefined {
    const bare = fromProtoEnum('USAGE_METRIC', metric);
    return bare && bare in UsageMetricType ? (bare as UsageMetricType) : undefined;
}

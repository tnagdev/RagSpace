import { useUsageStats } from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import { UsageMetricType, PlanType } from '@/types/payment.types';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { Tooltip } from '../Tooltip';

interface UsageBadgeProps {
    metricType: UsageMetricType;
    className?: string;
}

const formatUsageValue = (metricType: UsageMetricType, value: number): string => {
    switch (metricType) {
        case UsageMetricType.STORAGE:
            const gb = value / (1024 * 1024 * 1024);
            return gb < 1 ? `${Math.round(value / (1024 * 1024))}MB` : `${gb.toFixed(1)}GB`;
        case UsageMetricType.MAX_VIDEO_LENGTH:
        case UsageMetricType.MAX_AUDIO_DURATION:
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        default:
            return value.toString();
    }
};

export const UsageBadge = ({ metricType, className = '' }: UsageBadgeProps) => {
    const { data: usage } = useUsageStats();
    const { openPlansModal } = usePlansModal();

    const quota = usage?.quotas?.find(q => q.metricType === metricType);

    if (!quota) return null;

    const isUnlimited = quota.limit === 0;
    const percentage = isUnlimited ? 0 : (quota.used / quota.limit) * 100;
    const isNearLimit = percentage >= 80;
    const atLimit = percentage >= 100;

    const handleClick = () => {
        if (isNearLimit || atLimit) {
            openPlansModal('You are approaching or have reached your usage limit. Upgrade your plan for more resources.');
        }
    };

    const badgeColor = atLimit
        ? 'bg-red-500/10 text-red-500 border-red-500/20'
        : isNearLimit
            ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
            : 'bg-green-500/10 text-green-500 border-green-500/20';

    const content = (
        <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${badgeColor} text-sm font-medium ${isNearLimit || atLimit ? 'cursor-pointer hover:opacity-80' : ''
                } ${className}`}
            onClick={handleClick}
        >
            {(isNearLimit || atLimit) && (
                <AlertCircle className="w-3.5 h-3.5" />
            )}
            <span>
                {formatUsageValue(metricType, quota.used)}
                {' / '}
                {isUnlimited ? '∞' : formatUsageValue(metricType, quota.limit)}
            </span>
        </div>
    );

    const tooltipMessage = isUnlimited
        ? 'Unlimited usage'
        : `${percentage.toFixed(0)}% used${isNearLimit ? ' - Click to upgrade' : ''}`;

    return (
        <Tooltip content={tooltipMessage}>
            {content}
        </Tooltip>
    );
};

interface UsageBarProps {
    className?: string;
}

export const UsageBar = ({ className = '' }: UsageBarProps) => {
    const { data: usage, isLoading } = useUsageStats();
    const { openPlansModal } = usePlansModal();

    if (isLoading || !usage) return null;

    const currentPlanType = usage?.subscription?.plan?.type || PlanType.FREE;

    // Find the most critical quota (highest percentage)
    const criticalQuota = usage.quotas
        ?.filter(q => q.limit > 0)
        .sort((a, b) => {
            const percentA = (a.used / a.limit) * 100;
            const percentB = (b.used / b.limit) * 100;
            return percentB - percentA;
        })[0];

    if (!criticalQuota) {
        return (
            <div className={`bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-3 ${className}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium">Current Plan: {currentPlanType}</span>
                    </div>
                    <span className="text-xs text-green-500">Unlimited Usage</span>
                </div>
            </div>
        );
    }

    const percentage = (criticalQuota.used / criticalQuota.limit) * 100;
    const isNearLimit = percentage >= 80;

    return (
        <div className={`bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-3 ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium">Usage Overview</span>
                </div>
                {isNearLimit && (
                    <button
                        onClick={() => openPlansModal('Upgrade your plan for more resources')}
                        className="text-xs text-purple-400 hover:text-purple-300 underline"
                    >
                        Upgrade
                    </button>
                )}
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Most Used Resource</span>
                    <span>
                        {percentage.toFixed(0)}% ({formatUsageValue(criticalQuota.metricType, criticalQuota.used)} / {formatUsageValue(criticalQuota.metricType, criticalQuota.limit)})
                    </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                    <div
                        className={`h-full transition-all ${percentage >= 90
                                ? 'bg-red-500'
                                : percentage >= 70
                                    ? 'bg-yellow-500'
                                    : 'bg-purple-500'
                            }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

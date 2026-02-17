import { type FC } from 'react';
import { AlertCircle } from 'lucide-react';
import { UsageMetricType } from '@/types/payment.types';
import { useStorageStats } from '@/hooks/useUpload';
import { useUsageStats } from '@/hooks/usePayment';

interface UsageWidgetProps {
    variant?: 'sidebar' | 'settings';
    className?: string;
}

// Helper functions
const getQuotaLabel = (metric: string): string => {
    switch (metric) {
        case UsageMetricType.STORAGE:
            return 'Storage';
        case UsageMetricType.CONVERSATIONS:
            return 'AI Conversations';
        case UsageMetricType.FILE_CONVERSATIONS:
            return 'File Chats';
        case UsageMetricType.YOUTUBE_VIDEOS:
            return 'YouTube Videos';
        case UsageMetricType.MAX_VIDEO_LENGTH:
            return 'Max Video Length';
        case UsageMetricType.MAX_AUDIO_DURATION:
            return 'Max Audio Duration';
        default:
            return metric;
    }
};

const formatUsageValue = (metric: string, value: number): string => {
    switch (metric) {
        case UsageMetricType.STORAGE: {
            const tb = value / (1024 * 1024 * 1024 * 1024);
            const gb = value / (1024 * 1024 * 1024);
            const mb = value / (1024 * 1024);
            const kb = value / 1024;
            if (tb >= 1) return `${tb.toFixed(2)}TB`;
            if (gb >= 1) return `${gb.toFixed(2)}GB`;
            if (mb >= 1) return `${mb.toFixed(0)}MB`;
            if (kb >= 1) return `${kb.toFixed(0)}KB`;
            return `${value}B`;
        }
        case UsageMetricType.MAX_VIDEO_LENGTH:
        case UsageMetricType.MAX_AUDIO_DURATION: {
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m`;
            return `${value}s`;
        }
        case UsageMetricType.CONVERSATIONS:
        case UsageMetricType.FILE_CONVERSATIONS:
        case UsageMetricType.YOUTUBE_VIDEOS:
            return value.toString();
        default:
            return value.toString();
    }
};

const isPerVideoLimit = (metric: string): boolean => {
    return metric === UsageMetricType.MAX_VIDEO_LENGTH ||
        metric === UsageMetricType.MAX_AUDIO_DURATION;
};

export const UsageWidget: FC<UsageWidgetProps> = ({ variant = 'sidebar', className = '' }) => {
    const { data: storageStats, isLoading: isLoadingStorage } = useStorageStats();
    const { data: usage, isLoading: isLoadingUsage } = useUsageStats();

    const isSidebar = variant === 'sidebar';

    // Style configurations based on variant
    const styles = {
        textPrimary: isSidebar ? 'text-text-secondary' : 'text-gray-300',
        textMuted: isSidebar ? 'text-text-muted' : 'text-gray-400',
        bgBar: isSidebar ? 'bg-sidebar-border' : 'bg-gray-700',
        progressGradient: isSidebar
            ? 'bg-linear-to-r from-gradient-primary-start to-gradient-primary-end'
            : 'bg-gradient-to-r from-purple-500 to-pink-500',
    };

    if (isLoadingUsage || isLoadingStorage) {
        return (
            <div className={`text-xs ${styles.textMuted} ${className}`}>
                {isSidebar ? 'Loading...' : 'Loading usage data...'}
            </div>
        );
    }

    // Find storage quota from usage stats
    const storageQuota = usage?.quotas?.find(q => q.metric === UsageMetricType.STORAGE);

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Storage from storage stats and usage quota */}
            {storageStats && storageQuota && (() => {
                const usedBytes = storageStats.usedBytes;
                const limitBytes = storageQuota.limit;
                const isUnlimited = limitBytes === 0;
                const usedPercentage = isUnlimited ? 0 : (usedBytes / limitBytes) * 100;

                return (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium ${styles.textPrimary}`}>
                                Storage
                            </span>
                            <span className={`text-xs ${usedPercentage >= 100 ? 'text-red-500' :
                                usedPercentage >= 80 ? 'text-yellow-500' :
                                    styles.textMuted
                                }`}>
                                {formatUsageValue(UsageMetricType.STORAGE, usedBytes)} / {isUnlimited ? '∞' : formatUsageValue(UsageMetricType.STORAGE, limitBytes)}
                            </span>
                        </div>
                        {!isUnlimited && (
                            <div className={`w-full ${styles.bgBar} rounded-full h-1.5 overflow-hidden`}>
                                <div
                                    className={`h-full transition-all duration-500 ${usedPercentage >= 100
                                        ? 'bg-red-500'
                                        : usedPercentage >= 90
                                            ? 'bg-red-400'
                                            : usedPercentage >= 70
                                                ? 'bg-yellow-500'
                                                : styles.progressGradient
                                        }`}
                                    style={{ width: `${Math.min(usedPercentage, 100)}%` }}
                                />
                            </div>
                        )}
                        <p className={`text-xs ${styles.textMuted}`}>
                            {storageStats.fileCount} {storageStats.fileCount === 1 ? 'file' : 'files'}
                        </p>
                        {usedPercentage >= 80 && !isUnlimited && (
                            <div className="flex items-center gap-1 mt-1">
                                <AlertCircle className="w-3 h-3 text-yellow-500" />
                                <span className="text-xs text-yellow-500">
                                    {usedPercentage.toFixed(0)}% used
                                </span>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Usage quotas */}
            {usage?.quotas && usage.quotas.length > 0 && (
                <>
                    {usage.quotas.map((quota) => {
                        // Skip storage as we already show it above
                        if (quota.metric === UsageMetricType.STORAGE) return null;

                        const isUnlimited = quota.limit === 0;
                        const percentage = isUnlimited ? 0 : (quota.used / quota.limit) * 100;
                        const isNearLimit = percentage >= 80;
                        const isAtLimit = percentage >= 100;
                        const isPerVideo = isPerVideoLimit(quota.metric);

                        return (
                            <div key={quota.metric} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className={`text-xs font-medium ${styles.textPrimary}`}>
                                        {getQuotaLabel(quota.metric)}
                                        {isPerVideo && (
                                            <p className={`${styles.textMuted}`}>(per video)</p>
                                        )}
                                    </p>
                                    {isPerVideo ? (
                                        <span className={`text-xs ${styles.textMuted}`}>
                                            {isUnlimited ? 'Unlimited' : `Up to ${formatUsageValue(quota.metric, quota.limit)}`}
                                        </span>
                                    ) : (
                                        <span className={`text-xs ${isAtLimit ? 'text-red-500' :
                                            isNearLimit ? 'text-yellow-500' :
                                                styles.textMuted
                                            }`}>
                                            {formatUsageValue(quota.metric, quota.used)} / {isUnlimited ? '∞' : formatUsageValue(quota.metric, quota.limit)}
                                        </span>
                                    )}
                                </div>
                                {!isPerVideo && !isUnlimited && (
                                    <div className={`w-full ${styles.bgBar} rounded-full h-1.5 overflow-hidden`}>
                                        <div
                                            className={`h-full transition-all duration-500 ${percentage >= 100
                                                ? 'bg-red-500'
                                                : percentage >= 90
                                                    ? 'bg-red-400'
                                                    : percentage >= 70
                                                        ? 'bg-yellow-500'
                                                        : styles.progressGradient
                                                }`}
                                            style={{ width: `${Math.min(percentage, 100)}%` }}
                                        />
                                    </div>
                                )}
                                {!isPerVideo && isNearLimit && !isUnlimited && (
                                    <div className="flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3 text-yellow-500" />
                                        <span className="text-xs text-yellow-500">
                                            {percentage.toFixed(0)}% used
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}

            {/* No data message */}
            {(!usage?.quotas || usage.quotas.length === 0) && !storageStats && (
                <p className={`text-center ${styles.textMuted} text-sm py-4`}>
                    No usage data available
                </p>
            )}
        </div>
    );
};

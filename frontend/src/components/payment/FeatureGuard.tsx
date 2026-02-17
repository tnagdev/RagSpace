import { ReactNode } from 'react';
import { useSubscription } from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import { PlanType } from '@/types/payment.types';
import { Tooltip } from '@/components/Tooltip';
import { Lock } from 'lucide-react';

interface FeatureGuardProps {
    requiredPlan: PlanType;
    children: ReactNode;
    fallback?: ReactNode;
    showTooltip?: boolean;
    tooltipMessage?: string;
    onDisabledClick?: () => void;
}

const PLAN_HIERARCHY = {
    [PlanType.FREE]: 0,
    [PlanType.BASIC]: 1,
    [PlanType.PRO]: 2,
};

export const FeatureGuard = ({
    requiredPlan,
    children,
    fallback,
    showTooltip = true,
    tooltipMessage,
    onDisabledClick,
}: FeatureGuardProps) => {
    const { data: subscription } = useSubscription();
    const { openPlansModal } = usePlansModal();

    const currentPlan = subscription?.plan?.type || PlanType.FREE;
    const currentPlanLevel = PLAN_HIERARCHY[currentPlan];
    const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan];
    const hasAccess = currentPlanLevel >= requiredPlanLevel;

    if (hasAccess) {
        return <>{children}</>;
    }

    const defaultMessage = `This feature requires ${requiredPlan} plan or higher`;
    const message = tooltipMessage || defaultMessage;

    const handleClick = () => {
        if (onDisabledClick) {
            onDisabledClick();
        } else {
            openPlansModal(message);
        }
    };

    if (fallback) {
        return <>{fallback}</>;
    }

    // Wrap children in a disabled state with click handler
    const disabledContent = (
        <div
            className="relative inline-block cursor-not-allowed opacity-60"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClick();
            }}
        >
            <div className="pointer-events-none">{children}</div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/70 rounded-full p-2">
                    <Lock className="w-4 h-4 text-yellow-500" />
                </div>
            </div>
        </div>
    );

    if (showTooltip) {
        return (
            <Tooltip content={message}>
                {disabledContent}
            </Tooltip>
        );
    }

    return disabledContent;
};

// Hook for checking feature access
export const useFeatureAccess = (requiredPlan: PlanType): boolean => {
    const { data: subscription } = useSubscription();
    const currentPlan = subscription?.plan?.type || PlanType.FREE;
    const currentPlanLevel = PLAN_HIERARCHY[currentPlan];
    const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan];
    return currentPlanLevel >= requiredPlanLevel;
};

// Hook for getting current plan
export const useCurrentPlan = (): PlanType => {
    const { data: subscription } = useSubscription();
    return subscription?.plan?.type || PlanType.FREE;
};

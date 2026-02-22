import { useSubscription, usePlans, useCancelSubscription, useCancelScheduledChange } from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import Button from '@/components/Button';
import { Loader } from '@/components/Loader';
import { UsageWidget } from '@/components/UsageWidget';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AlertCircle, Check, CreditCard, Calendar, X } from 'lucide-react';
import { PlanType, SubscriptionStatus } from '@/types/payment.types';
import { useState } from 'react';

const getCurrencySymbol = (priceUnit: string): string => {
    const currencyMap: Record<string, string> = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹',
        'JPY': '¥',
        'AUD': 'A$',
        'CAD': 'C$',
    };
    return currencyMap[priceUnit.toUpperCase()] || priceUnit;
};

export const BillingSettings = () => {
    const { data: subscription, isLoading: subLoading } = useSubscription();
    const { data: plans, isLoading: plansLoading } = usePlans();
    const { openPlansModal } = usePlansModal();
    const cancelSubscription = useCancelSubscription();
    const cancelScheduledChange = useCancelScheduledChange();
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [emailReceipts, setEmailReceipts] = useState(true);

    const handleCancelSubscription = async () => {
        try {
            await cancelSubscription.mutateAsync(false);
            setShowCancelConfirm(false);
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
        }
    };

    if (subLoading || plansLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader />
            </div>
        );
    }

    const currentPlan = subscription?.plan;
    const isFreePlan = currentPlan?.type === PlanType.FREE;
    const isCancelled = subscription?.status === SubscriptionStatus.CANCELLED;
    const hasScheduledChange = subscription?.scheduledPlanId && subscription?.scheduledChangeAt;
    const scheduledPlan = hasScheduledChange
        ? plans?.find(p => p.id === subscription.scheduledPlanId)
        : null;
    const scheduledDate = hasScheduledChange
        ? new Date(subscription.scheduledChangeAt).toLocaleDateString()
        : null;

    const handleCancelScheduledChange = async () => {
        try {
            await cancelScheduledChange.mutateAsync();
        } catch (error) {
            console.error('Failed to cancel scheduled change:', error);
        }
    };

    return (
        <div className="space-y-8">
            {/* Current Plan Section */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold">Current Plan</h2>

                <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-purple-500/10 rounded-lg">
                                <CreditCard className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold mb-1">{currentPlan?.name} Plan</h3>
                                {currentPlan?.price === 0 ? (
                                    <p className="text-gray-400">Free forever</p>
                                ) : (
                                    <p className="text-2xl font-bold text-purple-400">
                                        {getCurrencySymbol(currentPlan?.priceUnit || 'USD')}{currentPlan?.price}
                                        <span className="text-sm text-gray-400 font-normal">/month</span>
                                    </p>
                                )}
                                {subscription?.currentPeriodEnd && !isFreePlan && (
                                    <p className="text-sm text-gray-400 mt-2">
                                        {isCancelled ? 'Ends' : 'Renews'} on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openPlansModal('View Plans')}
                            >
                                View Plans
                            </Button>
                            {!isFreePlan && !isCancelled && !hasScheduledChange && (
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setShowCancelConfirm(true)}
                                >
                                    Cancel Subscription
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Scheduled Change Alert */}
            {hasScheduledChange && scheduledPlan && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Calendar className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-semibold text-amber-400 mb-1">
                                Scheduled Plan Change
                            </h4>
                            <p className="text-sm text-gray-300 mb-3">
                                {subscription.scheduledChangeType === 'cancel_to_free'
                                    ? `Your subscription will be cancelled and you'll move to the Free plan on ${scheduledDate}. You'll keep access to your current plan until then.`
                                    : `Your plan will change to ${scheduledPlan.name} on ${scheduledDate}. You'll keep access to your current plan until then.`
                                }
                            </p>
                            <Button
                                onClick={handleCancelScheduledChange}
                                disabled={cancelScheduledChange.isPending}
                                variant="secondary"
                                size="sm"
                            >
                                {cancelScheduledChange.isPending ? (
                                    <>
                                        <Loader className="w-3 h-3 mr-2" />
                                        Cancelling...
                                    </>
                                ) : (
                                    <>
                                        <X className="w-3 h-3 mr-2" />
                                        Cancel Scheduled Change
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancelled Warning */}
            {isCancelled && subscription && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-yellow-500 mb-1">
                            Subscription Cancelled
                        </h4>
                        <p className="text-sm text-gray-300">
                            Your subscription will remain active until{' '}
                            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            <ConfirmDialog
                isOpen={showCancelConfirm}
                onClose={() => setShowCancelConfirm(false)}
                onConfirm={handleCancelSubscription}
                title="Cancel Subscription"
                message="Are you sure you want to cancel your subscription? Your plan will remain active until the end of the billing period, and you'll be downgraded to the Free plan after that."
                confirmText="Yes, Cancel"
                cancelText="No, Keep Plan"
                variant="danger"
                isLoading={cancelSubscription.isPending}
            />

            {/* Billing Preferences */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold">Billing Preferences</h3>

                <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium mb-1">Email me receipts</h4>
                            <p className="text-sm text-gray-400">
                                Send receipts to your account email when a payment succeeds.
                            </p>
                        </div>
                        <button
                            onClick={() => setEmailReceipts(!emailReceipts)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${emailReceipts ? 'bg-purple-500' : 'bg-gray-600'
                                }`}
                            aria-label="Toggle email receipts"
                        >
                            <div
                                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${emailReceipts ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Usage Statistics */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold">Usage Statistics</h3>

                <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700 p-5">
                    <UsageWidget variant="settings" />
                </div>
            </div>


        </div>
    );
};

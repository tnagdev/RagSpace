import { useSubscription, usePlans, useCancelSubscription } from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import Button from '@/components/Button';
import { Loader } from '@/components/Loader';
import { UsageWidget } from '@/components/UsageWidget';
import { AlertCircle, Check } from 'lucide-react';
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
    const sortedPlans = plans?.sort((a, b) => a.price - b.price) || [];

    return (
        <div className="space-y-8">
            {/* Header with Manage Billing */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Choose Your Plan</h2>
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sortedPlans.map((plan) => {
                    const isCurrentPlan = plan.type === currentPlan?.type;
                    const isPro = plan.type === PlanType.PRO;

                    return (
                        <div
                            key={plan.id}
                            className={`relative flex flex-col bg-gray-800/30 backdrop-blur-sm rounded-xl border-2 p-6 transition-all hover:bg-gray-800/50 ${isPro
                                ? 'border-purple-500 shadow-lg shadow-purple-500/10'
                                : plan.type === PlanType.BASIC
                                    ? 'border-gray-600'
                                    : 'border-gray-700'
                                }`}
                        >
                            {isPro && (
                                <div className="absolute -top-3 right-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-6">
                                <h3 className="text-2xl font-bold mb-3">{plan.name}</h3>
                                {plan.price === 0 ? (
                                    <div className="text-gray-400 text-sm">Free forever</div>
                                ) : (
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold">{getCurrencySymbol(plan.priceUnit)}{plan.price}</span>
                                        <span className="text-gray-400">/month</span>
                                    </div>
                                )}
                                {plan.description && (
                                    <p className="text-sm text-gray-400 mt-2">{plan.description}</p>
                                )}
                            </div>

                            <ul className="space-y-3 mb-6 min-h-[120px] flex-1">
                                {plan.features && plan.features.length > 0 ? (
                                    plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm">
                                            <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                                            <span className="text-gray-300">{feature}</span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-sm text-gray-400">Contact for custom features</li>
                                )}
                            </ul>

                            <Button
                                onClick={() => openPlansModal('Upgrade your plan')}
                                disabled={isCurrentPlan}
                                variant={isPro ? 'primary' : 'secondary'}
                                size="md"
                                className="w-full"
                            >
                                {isCurrentPlan ? 'Current Plan' : plan.type === PlanType.FREE ? 'Downgrade' : 'Upgrade'}
                            </Button>
                        </div>
                    );
                })}
            </div>

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

            {/* Security Options / Cancel Subscription */}
            {!isFreePlan && !isCancelled && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold">Security Options</h3>

                    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium mb-1 text-red-400">Cancel Subscription</h4>
                                <p className="text-sm text-gray-400">
                                    Your plan will remain active until the end of the billing period.
                                </p>
                            </div>
                            {showCancelConfirm ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-400 mr-2">Are you sure?</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowCancelConfirm(false)}
                                    >
                                        No
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={handleCancelSubscription}
                                        disabled={cancelSubscription.isPending}
                                    >
                                        {cancelSubscription.isPending ? 'Cancelling...' : 'Confirm'}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setShowCancelConfirm(true)}
                                >
                                    Cancel
                                </Button>
                            )}
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
        </div>
    );
};

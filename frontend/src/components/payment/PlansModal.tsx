import { useState } from 'react';
import { Modal } from '../Modal';
import Button from '../Button';
import {
    usePlansWithComparison,
    useCreateCheckout,
    useDowngradeSubscription,
} from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import { PlanType, type Plan } from '@/types/payment.types';
import { Check, Loader } from 'lucide-react';

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

const PLAN_FEATURES = {
    [PlanType.FREE]: [
        'Up to 10 conversations',
        '1 GB storage',
        '5 conversations per file',
        '3 YouTube videos',
        'Max 10 min video length',
    ],
    [PlanType.BASIC]: [
        'Up to 100 conversations',
        '10 GB storage',
        '50 conversations per file',
        '25 YouTube videos',
        'Max 60 min video length'
    ],
    [PlanType.PRO]: [
        'Unlimited conversations',
        '100 GB storage',
        'Unlimited file conversations',
        'Unlimited YouTube videos',
        'Unlimited video length'
    ],
};

const PLAN_COLORS = {
    [PlanType.FREE]: 'border-gray-600',
    [PlanType.BASIC]: 'border-purple-500',
    [PlanType.PRO]: 'border-yellow-500',
};

export const PlansModal = () => {
    const { isOpen, closePlansModal } = usePlansModal();
    const { data: plans, isLoading: plansLoading } = usePlansWithComparison();
    const createCheckout = useCreateCheckout();
    const downgradeSubscription = useDowngradeSubscription();
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    const handleSelectPlan = async (plan: Plan) => {
        if (plan.comparison === 'current') {
            return;
        }

        setSelectedPlanId(plan.id);

        try {
            if (plan.comparison === 'downgrade') {
                await downgradeSubscription.mutateAsync(plan.id);
                closePlansModal();
            } else {
                const { checkoutUrl } = await createCheckout.mutateAsync(plan.id);
                window.location.href = checkoutUrl;
            }
        } catch (error) {
            console.error('Failed to change plan:', error);
            setSelectedPlanId(null);
        }
    };

    const sortedPlans = plans?.sort((a, b) => a.price - b.price) || [];

    return (
        <Modal
            isOpen={isOpen}
            onClose={closePlansModal}
            title="Choose Your Plan"
            size="xl"
            showFooter={false}
            className="plans-modal"
        >
            <div className="space-y-6">
                {plansLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader className="w-8 h-8 animate-spin text-purple-500" />
                    </div>
                ) : (
                    <>
                        {/* Plans Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {sortedPlans.map((plan) => {
                                const isCurrentPlan = plan.comparison === 'current';
                                const isLoading = selectedPlanId === plan.id && (
                                    createCheckout.isPending ||
                                    downgradeSubscription.isPending
                                );
                                const features = PLAN_FEATURES[plan.type] || [];
                                const borderColor = PLAN_COLORS[plan.type];

                                // Determine button text based on comparison
                                let buttonText = 'Select Plan';
                                if (isCurrentPlan) {
                                    buttonText = 'Current Plan';
                                } else if (plan.comparison === 'upgrade') {
                                    buttonText = 'Upgrade Now';
                                } else if (plan.comparison === 'downgrade') {
                                    buttonText = 'Downgrade';
                                }

                                return (
                                    <div
                                        key={plan.id}
                                        className={`relative bg-gray-800/50 backdrop-blur-sm rounded-xl border-2 ${borderColor} p-6 flex flex-col transition-all hover:scale-105 hover:shadow-xl`}
                                    >
                                        {plan.type === PlanType.PRO && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                                                POPULAR
                                            </div>
                                        )}

                                        <div className="text-center mb-6">
                                            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                                            <div className="flex items-baseline justify-center gap-1">
                                                <span className="text-4xl font-bold text-purple-400">
                                                    {getCurrencySymbol(plan.priceUnit)}{plan.price}
                                                </span>
                                                <span className="text-gray-400">/month</span>
                                            </div>
                                            {plan.description && (
                                                <p className="text-sm text-gray-400 mt-2">
                                                    {plan.description}
                                                </p>
                                            )}
                                        </div>

                                        <ul className="space-y-3 mb-6 flex-1">
                                            {features.map((feature, idx) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                    <span className="text-sm text-gray-300">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <Button
                                            onClick={() => handleSelectPlan(plan)}
                                            disabled={isCurrentPlan || isLoading}
                                            variant={!isCurrentPlan ? 'primary' : 'secondary'}
                                            className="w-full"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader className="w-4 h-4 animate-spin mr-2" />
                                                    Processing...
                                                </>
                                            ) : (
                                                buttonText
                                            )}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                <div className="text-center text-sm text-gray-400 mt-6">
                    <p>All plans include secure payment processing via Lemon Squeezy</p>
                    <p className="mt-1">Cancel anytime. No hidden fees.</p>
                </div>
            </div>
        </Modal>
    );
};

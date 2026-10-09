import { useState } from 'react';
import { Modal } from '../Modal';
import Button from '../Button';
import { useChangePlan, usePlans } from '@/hooks/usePayment';
import { usePlansModal } from '@/contexts/PlansModalContext';
import type { Plan, PlanType } from '@/api/types';
import { formatPrice, sortByPrice } from '@/lib/billing';
import { Check, Loader } from 'lucide-react';

const PLAN_COLORS: Partial<Record<PlanType, string>> = {
    FREE: 'border-gray-600',
    BASIC: 'border-purple-500',
    PRO: 'border-yellow-500',
};

export const PlansModal = () => {
    const { isOpen, closePlansModal } = usePlansModal();
    const { data: plans, isLoading: plansLoading } = usePlans();
    const changePlan = useChangePlan();
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    const handleSelectPlan = async (plan: Plan) => {
        if (plan.comparison === 'CURRENT') {
            return;
        }
        setSelectedPlanId(plan.id);
        try {
            const result = await changePlan.mutateAsync(plan.id);
            if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl;
                return;
            }
            closePlansModal();
        } catch (error) {
            console.error('Failed to change plan:', error);
        }
        setSelectedPlanId(null);
    };

    const sortedPlans = sortByPrice(plans ?? []);

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
                                const isCurrentPlan = plan.comparison === 'CURRENT';
                                const isLoading = selectedPlanId === plan.id && changePlan.isPending;
                                const borderColor = PLAN_COLORS[plan.type] ?? 'border-gray-600';

                                // Determine button text based on comparison
                                let buttonText = 'Select Plan';
                                if (isCurrentPlan) {
                                    buttonText = 'Current Plan';
                                } else if (plan.comparison === 'UPGRADE') {
                                    buttonText = 'Upgrade Now';
                                } else if (plan.comparison === 'DOWNGRADE') {
                                    buttonText = 'Downgrade';
                                }

                                return (
                                    <div
                                        key={plan.id}
                                        className={`relative bg-gray-800/50 backdrop-blur-sm rounded-xl border-2 ${borderColor} p-6 flex flex-col transition-all hover:scale-105 hover:shadow-xl`}
                                    >
                                        {plan.type === 'PRO' && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                                                POPULAR
                                            </div>
                                        )}

                                        <div className="text-center mb-6">
                                            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                                            <div className="flex items-baseline justify-center gap-1">
                                                <span className="text-4xl font-bold text-purple-400">
                                                    {formatPrice(plan.price)}
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
                                            {plan.features.map((feature, idx) => (
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

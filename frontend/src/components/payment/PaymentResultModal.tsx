import { Modal } from '@/components/Modal';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Button from '@/components/Button';
import { useQueryClient } from '@tanstack/react-query';
import { paymentKeys } from '@/hooks/usePayment';
import { useSubscription } from '@/hooks/usePayment';
import { useEffect } from 'react';

type PaymentStatus = 'success' | 'error' | 'cancelled';

interface PaymentResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    status: PaymentStatus;
    planName?: string;
    errorMessage?: string;
}

const PaymentResultModal: React.FC<PaymentResultModalProps> = ({
    isOpen,
    onClose,
    status,
    planName,
    errorMessage,
}) => {
    const queryClient = useQueryClient();
    const { data: subscription } = useSubscription();

    useEffect(() => {
        if (isOpen && status === 'success') {
            queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
            queryClient.invalidateQueries({ queryKey: paymentKeys.usage() });
        }
    }, [isOpen, status, queryClient]);

    const getIcon = () => {
        switch (status) {
            case 'success':
                return <CheckCircle className="w-16 h-16 text-green-500" />;
            case 'error':
                return <XCircle className="w-16 h-16 text-red-500" />;
            case 'cancelled':
                return <AlertCircle className="w-16 h-16 text-yellow-500" />;
        }
    };

    const getTitle = () => {
        switch (status) {
            case 'success':
                return 'Payment Successful';
            case 'error':
                return 'Payment Failed';
            case 'cancelled':
                return 'Payment Cancelled';
        }
    };

    const getMessage = () => {
        switch (status) {
            case 'success':
                const currentPlan = subscription?.plan?.name || planName || 'Premium';
                return `You're now subscribed to the ${currentPlan} plan. All features are now available.`;
            case 'error':
                return errorMessage || 'An error occurred during payment. Your payment has been refunded if charged. Please try again.';
            case 'cancelled':
                return 'Payment was cancelled. No charges were made.';
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            showFooter={false}
            showHeader={false}
            size="sm"
            contentClassName='pb-0'
        >
            <div className="text-center py-6">
                <div className="flex justify-center mb-4">
                    {getIcon()}
                </div>

                <h2 className="text-xl font-semibold mb-2">{getTitle()}</h2>

                <p className="text-text-muted text-sm mb-6">
                    {getMessage()}
                </p>

                {status === 'success' ? (
                    <div className="flex gap-3">
                        <Button
                            onClick={() => {
                                onClose();
                                window.location.href = '/settings';
                            }}
                            variant="secondary"
                            className="flex-1"
                        >
                            View Details
                        </Button>
                        <Button
                            onClick={onClose}
                            variant="primary"
                            className="flex-1"
                        >
                            Continue
                        </Button>
                    </div>
                ) : (
                    <Button
                        onClick={onClose}
                        variant="secondary"
                        className="w-auto px-8"
                    >
                        Close
                    </Button>
                )}
            </div>
        </Modal>
    );
};

export default PaymentResultModal;

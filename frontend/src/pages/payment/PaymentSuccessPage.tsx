import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle, ArrowRight } from 'lucide-react';
import Button from '@/components/Button';
import { useQueryClient } from '@tanstack/react-query';
import { paymentKeys } from '@/hooks/usePayment';

const PaymentSuccessPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    useEffect(() => {
        // Invalidate subscription and usage queries to refetch updated data
        queryClient.invalidateQueries({ queryKey: paymentKeys.subscription() });
        queryClient.invalidateQueries({ queryKey: paymentKeys.usage() });
    }, [queryClient]);

    const handleContinue = () => {
        navigate({ to: '/files' });
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="card p-8 text-center">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                            <CheckCircle className="w-12 h-12 text-green-500" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold mb-4">Payment Successful!</h1>

                    <p className="text-gray-400 mb-8">
                        Thank you for subscribing! Your subscription has been activated and you now have access to all premium features.
                    </p>

                    <div className="space-y-4">
                        <Button
                            onClick={handleContinue}
                            variant="primary"
                            className="w-full"
                        >
                            Continue to Files
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>

                        <Button
                            onClick={() => navigate({ to: '/settings' })}
                            variant="secondary"
                            className="w-full"
                        >
                            View Subscription Details
                        </Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-700">
                        <p className="text-sm text-gray-500">
                            You'll receive a confirmation email with your subscription details shortly.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccessPage;

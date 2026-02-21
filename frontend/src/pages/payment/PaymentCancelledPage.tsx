import { useNavigate } from '@tanstack/react-router';
import { XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import Button from '@/components/Button';
import { usePlansModal } from '@/contexts/PlansModalContext';

const PaymentCancelledPage = () => {
    const navigate = useNavigate();
    const { openPlansModal } = usePlansModal();

    const handleTryAgain = () => {
        openPlansModal();
        navigate({ to: '/files' });
    };

    const handleGoBack = () => {
        navigate({ to: '/files' });
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="card p-8 text-center">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                            <XCircle className="w-12 h-12 text-red-500" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold mb-4">Payment Cancelled</h1>

                    <p className="text-gray-400 mb-8">
                        Your payment was cancelled. No charges were made to your account. You can try again whenever you're ready.
                    </p>

                    <div className="space-y-4">
                        <Button
                            onClick={handleTryAgain}
                            variant="primary"
                            className="w-full"
                        >
                            Try Again
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>

                        <Button
                            onClick={handleGoBack}
                            variant="secondary"
                            className="w-full"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Files
                        </Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-700">
                        <p className="text-sm text-gray-500">
                            Need help? Contact our support team at support@ragspace.com
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentCancelledPage;

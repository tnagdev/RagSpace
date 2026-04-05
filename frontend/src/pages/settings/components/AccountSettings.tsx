import { useState } from 'react';
import { useCurrentUser } from '@/hooks/auth';
import { useForgotPassword } from '@/hooks/auth';
import Button from '@/components/Button';
import { Loader } from '@/components/Loader';
import { User, KeyRound, CheckCircle, AlertCircle, Mail } from 'lucide-react';

type AlertState = { type: 'success' | 'error'; message: string } | null;

const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 p-6">
        {children}
    </div>
);

const Alert = ({ alert }: { alert: AlertState }) => {
    if (!alert) return null;
    const isSuccess = alert.type === 'success';
    return (
        <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${isSuccess ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
        >
            {isSuccess ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {alert.message}
        </div>
    );
};

export const AccountSettings = () => {
    const { data: user, isLoading } = useCurrentUser();
    const forgotPassword = useForgotPassword();

    const [resetAlert, setResetAlert] = useState<AlertState>(null);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader />
            </div>
        );
    }

    const handleSendResetLink = async () => {
        setResetAlert(null);
        try {
            await forgotPassword.mutateAsync(user!.email);
            setResetAlert({ type: 'success', message: `A password reset link has been sent to ${user!.email}.` });
        } catch {
            setResetAlert({ type: 'error', message: 'Failed to send reset email. Please try again.' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Profile Info */}
            <SectionCard>
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <User className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Profile Information</h2>
                        <p className="text-sm text-gray-400">Your account information</p>
                    </div>
                </div>

                {/* Read-only info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 pb-5 border-b border-gray-700">
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Email</span>
                        <p className="mt-1 text-sm text-gray-300 font-mono">{user?.email}</p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Current Name</span>
                        <p className="mt-1 text-sm text-gray-300">{user?.name || '—'}</p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Account Created</span>
                        <p className="mt-1 text-sm text-gray-300">
                            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Email Verified</span>
                        <p className={`mt-1 text-sm font-medium ${user?.emailVerified ? 'text-green-400' : 'text-yellow-400'}`}>
                            {user?.emailVerified ? 'Verified' : 'Not verified'}
                        </p>
                    </div>
                </div>
            </SectionCard>

            {/* Reset Password */}
            <SectionCard>
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <KeyRound className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Reset Password</h2>
                        <p className="text-sm text-gray-400">We'll send a secure reset link to your email address</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-400 flex-1">
                        <Mail className="w-4 h-4 shrink-0 text-gray-500" />
                        Reset link will be sent to <span className="text-gray-200 font-medium">{user?.email}</span>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSendResetLink}
                        loading={forgotPassword.isPending}
                        disabled={forgotPassword.isPending}
                        className="shrink-0"
                    >
                        Send Reset Link
                    </Button>
                </div>
                {resetAlert && (
                    <div className="mt-4">
                        <Alert alert={resetAlert} />
                    </div>
                )}
            </SectionCard>


        </div>
    );
};

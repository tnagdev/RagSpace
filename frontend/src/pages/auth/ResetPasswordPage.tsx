import { Formik, Form } from 'formik';
import { FormInput } from '../../components/form';
import { Link, useNavigate } from '@tanstack/react-router';
import { IoCheckmarkCircle, IoWarning } from 'react-icons/io5';
import { useState } from 'react';
import { useResetPassword } from '@/hooks/auth';

interface ResetPasswordValues {
    password: string;
    confirmPassword: string;
}

const ResetPasswordPage = () => {
    const navigate = useNavigate();
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState('');
    const resetPassword = useResetPassword();

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    const urlError = params.get('error');

    if (urlError) {
        const message = urlError === 'INVALID_TOKEN'
            ? 'This password reset link is invalid or has already been used.'
            : 'This password reset link has expired.';

        return (
            <div className="w-full text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <IoWarning size={40} className="text-red-400" />
                </div>
                <h1 className="text-3xl font-bold text-text-primary mb-3">Link unavailable</h1>
                <p className="text-text-secondary mb-8">{message}<br />Please request a new reset link.</p>
                <Link
                    to="/auth/forgot-password"
                    className="inline-block bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-all duration-200"
                >
                    Request new link
                </Link>
            </div>
        );
    }

    const initialValues: ResetPasswordValues = {
        password: '',
        confirmPassword: '',
    };

    const handleSubmit = async (values: ResetPasswordValues) => {
        setError('');
        if (!token) {
            setError('Invalid or missing reset token. Please request a new reset link.');
            return;
        }
        try {
            await resetPassword.mutateAsync({ token, newPassword: values.password });
            setIsSubmitted(true);
            setTimeout(() => {
                navigate({ to: '/auth/login' });
            }, 3000);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Invalid or expired reset token. Please request a new link.');
        }
    };

    if (isSubmitted) {
        return (
            <div className="w-full text-center">
                {/* Success Icon */}
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <IoCheckmarkCircle size={40} className="text-green-500" />
                </div>

                {/* Success Message */}
                <h1 className="text-3xl font-bold text-text-primary mb-3">
                    Password reset successful!
                </h1>
                <p className="text-text-secondary mb-8">
                    Your password has been successfully reset. You'll be redirected to the sign in page shortly.
                </p>

                {/* Action */}
                <Link
                    to="/auth/login"
                    className="inline-block bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-all duration-200"
                >
                    Sign in now
                </Link>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-text-primary mb-2">
                    Reset your password
                </h1>
                <p className="text-text-secondary">
                    Please enter your new password
                </p>
            </div>

            {/* Reset Password Form */}
            <Formik
                initialValues={initialValues}
                onSubmit={handleSubmit}
                validate={(values) => {
                    const errors: any = {};

                    if (!values.password) {
                        errors.password = 'Password is required';
                    } else if (values.password.length < 8) {
                        errors.password = 'Password must be at least 8 characters';
                    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(values.password)) {
                        errors.password = 'Password must contain uppercase, lowercase, and number';
                    }

                    if (!values.confirmPassword) {
                        errors.confirmPassword = 'Please confirm your password';
                    } else if (values.password !== values.confirmPassword) {
                        errors.confirmPassword = 'Passwords do not match';
                    }

                    return errors;
                }}
            >
                {({ isSubmitting }) => (
                    <Form className="space-y-5">
                        <FormInput
                            name="password"
                            type="password"
                            label="New password"
                            placeholder="Create a strong password"
                            helperText="At least 8 characters with uppercase, lowercase, and number"
                            required
                        />

                        <FormInput
                            name="confirmPassword"
                            type="password"
                            label="Confirm new password"
                            placeholder="Re-enter your password"
                            required
                        />

                        {error && (
                            <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                                <IoWarning size={16} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={resetPassword.isPending}
                            className="w-full bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {resetPassword.isPending ? 'Resetting password...' : 'Reset password'}
                        </button>
                    </Form>
                )}
            </Formik>

            {/* Back to Login Link */}
            <div className="mt-8 text-center text-sm text-text-secondary">
                Remember your password?{' '}
                <Link
                    to="/auth/login"
                    className="font-medium text-accent-primary hover:text-accent-primary-hover"
                >
                    Sign in
                </Link>
            </div>
        </div>
    );
};

export default ResetPasswordPage;

import { Formik, Form } from 'formik';
import { FormInput } from '../../components/form';
import { Link } from '@tanstack/react-router';
import { IoArrowBack, IoMail, IoWarning } from 'react-icons/io5';
import { useState } from 'react';
import { useForgotPassword } from '@/hooks/auth';

interface ForgotPasswordValues {
    email: string;
}

const ForgotPasswordPage = () => {
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState('');
    const [error, setError] = useState('');
    const forgotPassword = useForgotPassword();

    const initialValues: ForgotPasswordValues = {
        email: '',
    };

    const handleSubmit = async (values: ForgotPasswordValues) => {
        setError('');
        try {
            await forgotPassword.mutateAsync(values.email);
            setSubmittedEmail(values.email);
            setIsSubmitted(true);
        } catch (err: any) {
            const msg = err?.response?.data?.error;
            if (err?.response?.status === 404 || msg?.toLowerCase().includes('no account')) {
                setError('No account found with this email address.');
            } else {
                setError('Something went wrong. Please try again.');
            }
        }
    };

    if (isSubmitted) {
        return (
            <div className="w-full text-center">
                {/* Success Icon */}
                <div className="w-16 h-16 bg-accent-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <IoMail size={32} className="text-accent-primary" />
                </div>

                {/* Success Message */}
                <h1 className="text-3xl font-bold text-text-primary mb-3">
                    Check your email
                </h1>
                <p className="text-text-secondary mb-8 max-w-md mx-auto">
                    We've sent password reset instructions to <strong className="text-text-primary">{submittedEmail}</strong>. Please check your inbox and follow the link to reset your password.
                </p>

                {/* Actions */}
                <div className="space-y-3">
                    <Link
                        to="/auth/login"
                        className="block w-full bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-4 rounded-lg transition-all duration-200"
                    >
                        Back to sign in
                    </Link>

                    <button
                        onClick={() => setIsSubmitted(false)}
                        className="block w-full text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Didn't receive the email? Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Back Button */}
            <Link
                to="/auth/login"
                className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-8 transition-colors"
            >
                <IoArrowBack size={16} />
                Back to sign in
            </Link>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-text-primary mb-2">
                    Forgot password?
                </h1>
                <p className="text-text-secondary">
                    No worries, we'll send you reset instructions
                </p>
            </div>

            {/* Forgot Password Form */}
            <Formik
                initialValues={initialValues}
                onSubmit={handleSubmit}
                validate={(values) => {
                    const errors: any = {};
                    if (!values.email) {
                        errors.email = 'Email is required';
                    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)) {
                        errors.email = 'Invalid email address';
                    }
                    return errors;
                }}
            >
                {({ isSubmitting }) => (
                    <Form className="space-y-5">
                        <FormInput
                            name="email"
                            type="email"
                            label="Email address"
                            placeholder="you@example.com"
                            helperText="Enter the email address associated with your account"
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
                            disabled={isSubmitting || forgotPassword.isPending}
                            className="w-full bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {forgotPassword.isPending ? 'Sending...' : 'Send reset instructions'}
                        </button>
                    </Form>
                )}
            </Formik>
        </div>
    );
};

export default ForgotPasswordPage;

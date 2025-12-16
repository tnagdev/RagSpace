import { Formik, Form } from 'formik';
import { FormInput } from '../../components/form';
import { Link } from '@tanstack/react-router';
import { IoArrowBack, IoMail } from 'react-icons/io5';
import { useState } from 'react';

interface ForgotPasswordValues {
    email: string;
}

const ForgotPasswordPage = () => {
    const [isSubmitted, setIsSubmitted] = useState(false);

    const initialValues: ForgotPasswordValues = {
        email: '',
    };

    const handleSubmit = (values: ForgotPasswordValues) => {
        console.log('Password reset requested for:', values.email);
        // Handle forgot password logic here
        setIsSubmitted(true);
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
                    We've sent password reset instructions to your email address. Please check your inbox and follow the link to reset your password.
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

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-accent-primary hover:bg-accent-primary-hover text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Sending...' : 'Send reset instructions'}
                        </button>
                    </Form>
                )}
            </Formik>
        </div>
    );
};

export default ForgotPasswordPage;

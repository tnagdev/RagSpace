import { Formik, Form } from 'formik';
import { FormInput, FormCheckbox } from '../../components/form';
import { Link, useNavigate } from '@tanstack/react-router';
import { IoLogoGoogle, IoLogoGithub } from 'react-icons/io5';
import { signupSchema } from '@/lib/validationSchemas';
import { useSignUp } from '@/hooks/auth';
import Button from '@/components/Button';

interface SignupValues {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
}

const SignupPage = () => {
    const { mutateAsync: signUpUser, data, isError, isPending } = useSignUp();
    const navigate = useNavigate();
    const initialValues: SignupValues = {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        acceptTerms: false,
    };

    const handleSubmit = async (values: SignupValues) => {
        try {
            const payload = {
                email: values.email,
                password: values.password,
                firstName: values.firstName,
                lastName: values.lastName,
            }
            await signUpUser(payload);
            navigate({ to: '/auth/login', replace: true });
            console.log('Signup successful:', values);
        } catch (error) {
            console.error('Signup failed:', error);
        }
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-text-primary mb-2">
                    Create your account
                </h1>
                <p className="text-text-secondary">
                    Get started with FiloRag for free
                </p>
            </div>

            {/* Signup Form */}
            <Formik
                initialValues={initialValues}
                validationSchema={signupSchema}
                onSubmit={handleSubmit}
            >
                {({ values }) => (
                    <Form className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <FormInput
                                name="firstName"
                                type="text"
                                label="First name"
                                placeholder="John"
                                required
                            />
                            <FormInput
                                name="lastName"
                                type="text"
                                label="Last name"
                                placeholder="Doe"
                                required
                            />
                        </div>

                        <FormInput
                            name="email"
                            type="email"
                            label="Email address"
                            placeholder="you@example.com"
                            required
                        />

                        <FormInput
                            name="password"
                            type="password"
                            label="Password"
                            placeholder="Create a strong password"
                            helperText="At least 8 characters with uppercase, lowercase, and number"
                            required
                        />

                        <FormInput
                            name="confirmPassword"
                            type="password"
                            label="Confirm password"
                            placeholder="Re-enter your password"
                            required
                        />

                        <FormCheckbox
                            name="acceptTerms"
                            label={
                                <>
                                    I agree to the{' '}
                                    <Link to="/terms" className="text-accent-primary hover:text-accent-primary-hover">
                                        Terms of Service
                                    </Link>
                                    {' '}and{' '}
                                    <Link to="/privacy" className="text-accent-primary hover:text-accent-primary-hover">
                                        Privacy Policy
                                    </Link>
                                </>
                            }
                            required
                        />

                        <Button
                            type="submit"
                            disabled={isPending || !values.acceptTerms}
                            loading={isPending}
                            fullWidth
                            size="lg"
                        >
                            Create account
                        </Button>
                    </Form>
                )}
            </Formik>

            {/* Divider */}
            <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border-input" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-bg-card text-text-muted">Or sign up with</span>
                </div>
            </div>

            {/* Social Signup */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="social"
                    size="md"
                    icon={<IoLogoGoogle size={20} />}
                    type="button"
                    onClick={() => {
                        const callbackURL = `${window.location.origin}/auth/callback`;
                        window.location.href = `/api/auth/google/login?callbackURL=${encodeURIComponent(callbackURL)}`;
                    }}
                >
                    Google
                </Button>
                <Button
                    variant="social"
                    size="md"
                    icon={<IoLogoGithub size={20} />}
                    type="button"
                >
                    GitHub
                </Button>
            </div>

            {/* Login Link */}
            <div className="mt-8 text-center text-sm text-text-secondary">
                Already have an account?{' '}
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

export default SignupPage;

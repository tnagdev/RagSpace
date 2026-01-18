import { Formik, Form } from 'formik';
import { FormInput, FormCheckbox } from '../../components/form';
import { Link, useNavigate } from '@tanstack/react-router';
import { IoMailOutline, IoLockClosedOutline, IoLogoGoogle, IoLogoGithub } from 'react-icons/io5';
import { loginSchema } from '@/lib/validationSchemas';
import { useLogin } from '@/hooks/auth';
import Button from '@/components/Button';

interface LoginValues {
    email: string;
    password: string;
    rememberMe: boolean;
}

const LoginPage = () => {
    const { mutateAsync, isPending, isError } = useLogin();
    const navigate = useNavigate();
    const initialValues: LoginValues = {
        email: '',
        password: '',
        rememberMe: false,
    };

    const handleSubmit = async (values: LoginValues) => {
        try {
            await mutateAsync({
                emailOrUsername: values.email,
                password: values.password,
            });
            navigate({ to: '/', replace: true });
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-text-primary mb-1">
                    Welcome to Sign In <span className="text-accent-primary">Buddy!</span>
                </h1>
            </div>

            {/* Login Form */}
            <Formik
                initialValues={initialValues}
                validationSchema={loginSchema}
                onSubmit={handleSubmit}
            >
                {({ values }) => (
                    <Form className="space-y-4">
                        <FormInput
                            name="email"
                            type="email"
                            placeholder="Enter your email"
                            icon={<IoMailOutline size={20} />}
                            required
                        />

                        <FormInput
                            name="password"
                            type="password"
                            placeholder="Enter your password"
                            icon={<IoLockClosedOutline size={20} />}
                            required
                        />

                        <FormCheckbox
                            name="rememberMe"
                            label={<p>I agree to <Link to='#' className='text-accent-primary'>Terms of Service</Link> and <Link to='#' className='text-accent-primary'>Privacy of Policy</Link></p>}
                        />

                        <Button
                            type="submit"
                            disabled={isPending || !values.rememberMe}
                            loading={isPending}
                            fullWidth
                            size="lg"
                        >
                            Sign In
                        </Button>
                    </Form>
                )}
            </Formik>
            <div className="mt-4 text-center text-sm">
                <span className="text-text-secondary">Don't have an account? </span>
                <Link
                    to="/auth/signup"
                    className="font-medium text-accent-primary hover:text-accent-primary-hover transition-colors"
                >
                    Sign Up
                </Link>
            </div>

            {/* Divider */}
            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border-input" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-bg-card text-text-muted">Or continue with</span>
                </div>
            </div>

            {/* Social Login */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="social"
                    size="md"
                    icon={<IoLogoGoogle size={20} />}
                    type="button"
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
        </div>
    );
};

export default LoginPage;

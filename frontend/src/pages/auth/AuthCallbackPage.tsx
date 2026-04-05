import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { publicAxios, privateAxios } from '@/api/apiClient';

const AuthCallbackPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Session cookie was set by the auth-service OAuth callback.
                // Call /api/auth/session to retrieve the session token so the
                // app can treat the user as authenticated (same as email login).
                const response = await publicAxios.get('/api/auth/session');
                const { session, user } = response.data;

                if (session?.token && user) {
                    sessionStorage.setItem('accessToken', session.token);
                    privateAxios.defaults.headers.common.Authorization = `Bearer ${session.token}`;
                    navigate({ to: '/files', replace: true });
                } else {
                    navigate({ to: '/auth/login', replace: true });
                }
            } catch {
                navigate({ to: '/auth/login', replace: true });
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div
                className="h-12 w-12 animate-spin rounded-full border-4 border-solid"
                style={{ borderColor: 'var(--color-accent-primary)', borderBottomColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Completing sign in…
            </p>
        </div>
    );
};

export default AuthCallbackPage;

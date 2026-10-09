import { ApiError, api, unwrap } from './client';
import type { User } from './types';

export interface SignUpPayload {
    name: string;
    email: string;
    password: string;
}

export interface SignInPayload {
    email: string;
    password: string;
}

export const authAPI = {
    signUp: async (body: SignUpPayload) => (await unwrap(api.POST('/auth/sign-up', { body }))).user,
    signIn: async (body: SignInPayload) => (await unwrap(api.POST('/auth/sign-in', { body }))).user,
    signOut: () => unwrap(api.POST('/auth/sign-out')),

    // Resolves to null instead of throwing when there is no session, so guards can branch on it.
    me: async (): Promise<User | null> => {
        const { data, response } = await api.GET('/me');
        if (response.status === 401) return null;
        if (!response.ok || !data) throw new ApiError(response.status, undefined);
        return data;
    },
    updateMe: (body: { name?: string; username?: string | null }) => unwrap(api.PATCH('/me', { body })),
    deleteMe: () => unwrap(api.DELETE('/me')),

    changePassword: (body: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) =>
        unwrap(api.POST('/auth/password/change', { body: { revokeOtherSessions: true, ...body } })),
    forgotPassword: (email: string) => unwrap(api.POST('/auth/password/forgot', { body: { email } })),
    resetPassword: (token: string, newPassword: string) =>
        unwrap(api.POST('/auth/password/reset', { body: { token, newPassword } })),

    oauthUrl: (provider: 'google', redirectTo = '/files') =>
        `/api/v1/auth/oauth/${provider}?redirectTo=${encodeURIComponent(redirectTo)}`,
};

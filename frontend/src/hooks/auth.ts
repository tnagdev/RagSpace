import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authAPI, type SignInPayload, type SignUpPayload } from '@/api/auth';

export const authKeys = {
    all: ['auth'] as const,
    me: () => [...authKeys.all, 'me'] as const,
};

export const sessionQuery = {
    queryKey: authKeys.me(),
    queryFn: authAPI.me,
    staleTime: 60_000,
};

export const useCurrentUser = () => useQuery(sessionQuery);

export const useSignUp = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: SignUpPayload) => authAPI.signUp(data),
        onSuccess: (user) => queryClient.setQueryData(authKeys.me(), user),
    });
};

export const useLogin = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: SignInPayload) => authAPI.signIn(data),
        onSuccess: (user) => queryClient.setQueryData(authKeys.me(), user),
    });
};

export const useLogout = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => authAPI.signOut(),
        onSettled: () => {
            queryClient.clear();
            queryClient.setQueryData(authKeys.me(), null);
        },
    });
};

export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name?: string; username?: string | null }) => authAPI.updateMe(data),
        onSuccess: (user) => queryClient.setQueryData(authKeys.me(), user),
    });
};

export const useChangePassword = () =>
    useMutation({
        mutationFn: (data: { currentPassword: string; newPassword: string }) => authAPI.changePassword(data),
    });

export const useDeleteAccount = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => authAPI.deleteMe(),
        onSuccess: () => {
            queryClient.clear();
            queryClient.setQueryData(authKeys.me(), null);
        },
    });
};

export const useForgotPassword = () => useMutation({ mutationFn: (email: string) => authAPI.forgotPassword(email) });

export const useResetPassword = () =>
    useMutation({
        mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
            authAPI.resetPassword(token, newPassword),
    });

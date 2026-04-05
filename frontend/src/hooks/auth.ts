import { getCurrentUser, loginUser, logoutUser, signUpUser, updateProfile, changePassword, deleteAccount, forgotPassword, resetPassword } from "@/api/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"


export const useSignUp = () => {
    return useMutation({
        mutationKey: ['signUpUser'],
        mutationFn: (data: SignUpPayload) => signUpUser(data),
    });
}


export const useLogin = () => {
    return useMutation({
        mutationKey: ['loginUser'],
        mutationFn: (data: LoginPayload) => loginUser(data),
    });
}

export const useLogout = () => {
    return useMutation({
        mutationKey: ['logoutUser'],
        mutationFn: () => logoutUser(),
    });
}

export const useCurrentUser = () => {
    return useQuery({
        queryKey: ['getCurrentUser'],
        queryFn: () => getCurrentUser()
    });
}

export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ['updateProfile'],
        mutationFn: (data: { name?: string; username?: string }) => updateProfile(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['getCurrentUser'] });
        },
    });
}

export const useChangePassword = () => {
    return useMutation({
        mutationKey: ['changePassword'],
        mutationFn: (data: { currentPassword: string; newPassword: string }) => changePassword(data),
    });
}

export const useDeleteAccount = () => {
    return useMutation({
        mutationKey: ['deleteAccount'],
        mutationFn: () => deleteAccount(),
    });
}

export const useForgotPassword = () => {
    return useMutation({
        mutationKey: ['forgotPassword'],
        mutationFn: (email: string) => forgotPassword(email),
    });
}

export const useResetPassword = () => {
    return useMutation({
        mutationKey: ['resetPassword'],
        mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) =>
            resetPassword(token, newPassword),
    });
}
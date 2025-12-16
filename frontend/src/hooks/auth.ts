import { getCurrentUser, loginUser, logoutUser, signUpUser } from "@/api/auth";
import { useMutation, useQuery } from "@tanstack/react-query"


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
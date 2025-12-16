import { privateAxios, publicAxios } from "./apiClient"
import { ENDPOINTS } from "./endpoints";



export const signUpUser = async (data: SignUpPayload) => {
    const response = await publicAxios.post<AuthResponse>(ENDPOINTS.SIGNUP, data);
    return response.data;
}

export const loginUser = async (data: LoginPayload) => {
    const response = await publicAxios.post<AuthResponse>(ENDPOINTS.LOGIN, data);
    privateAxios.defaults.headers.common.Authorization = `Bearer ${response.data.token}`;
    sessionStorage.setItem('accessToken', response.data.token);
    return response.data;
}

export const getCurrentUser = async () => {
    const token = hasAccessToken();
    if (token) {
        privateAxios.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
    const response = await privateAxios.get<AuthSession>(ENDPOINTS.GET_CURRENT_USER);
    return response.data.user;
}

export const logoutUser = async () => {
    const response = await privateAxios.post<{ message: string }>(ENDPOINTS.LOGOUT);
    privateAxios.defaults.headers.common.Authorization = '';
    sessionStorage.removeItem('accessToken');
    return response.data;
}

export const hasAccessToken = (): string | null => {
    return sessionStorage.getItem('accessToken');
}

export const clearAuthData = () => {
    sessionStorage.removeItem('accessToken');
}
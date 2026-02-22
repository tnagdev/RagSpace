import axios from "axios";
import { clearAuthData, hasAccessToken } from "./auth";

declare global {
    interface Window {
        ENV?: {
            VITE_API_URL?: string;
        };
    }
}

export const API_BASE_URL =
    (typeof window !== 'undefined' && window.ENV?.VITE_API_URL) ||
    import.meta.env.VITE_API_URL ||
    "";

const publicAxios = axios.create({
    baseURL: API_BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
    withCredentials: true,
});

const privateAxios = axios.create({
    baseURL: API_BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
    withCredentials: true,
});

privateAxios.interceptors.request.use(
    (config) => {
        const token = hasAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Usage error handler callback (set by PlansModalProvider)
let usageErrorHandler: ((errorData: any) => void) | null = null;

export const setUsageErrorHandler = (handler: (errorData: any) => void) => {
    usageErrorHandler = handler;
};

privateAxios.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle 401 Unauthorized
        if (error?.response?.status === 401) {
            const isAuthPage = window.location.pathname.includes("/auth");
            clearAuthData();
            if (!isAuthPage) {
                window.location.href = "/auth/login";
            }
        }

        // Handle 402 Payment Required (usage limit errors)
        if (error?.response?.status === 402 && usageErrorHandler) {
            usageErrorHandler(error.response.data);
        }

        return Promise.reject(error);
    }
);

publicAxios.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error)
);

export { privateAxios, publicAxios };

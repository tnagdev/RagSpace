import axios from "axios";
import { clearAuthData, hasAccessToken } from "./auth";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

privateAxios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401) {
            const isAuthPage = window.location.pathname.includes("/auth");
            clearAuthData();
            if (!isAuthPage) {
                window.location.href = "/auth/login";
            }
        }
        return Promise.reject(error);
    }
);

publicAxios.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error)
);

export { privateAxios, publicAxios };

import { privateAxios } from "@/api/apiClient";



export const health = () => {
    return privateAxios.get<{ status: string }>('/healthz');
}
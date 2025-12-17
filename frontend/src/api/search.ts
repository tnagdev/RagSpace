import { privateAxios } from './apiClient';
import type { QueryRequest, QueryResponse } from '@/types/search.types';

const SEARCH_BASE = '/api/embed';

export const searchAPI = {
    search: async (params: QueryRequest): Promise<QueryResponse> => {
        const response = await privateAxios.post<QueryResponse>(
            `${SEARCH_BASE}/search`,
            params
        );
        return response.data;
    },
};

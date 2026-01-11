import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { searchAPI } from '@/api/search';
import type { QueryRequest, QueryResponse } from '@/types/search.types';

export const searchKeys = {
    all: ['search'] as const,
    queries: () => [...searchKeys.all, 'query'] as const,
    query: (params: QueryRequest) => [...searchKeys.queries(), params] as const,
};


const DEFAULT_SEARCH_OPTIONS: Partial<QueryRequest> = {
    top_k: 20,
    text_weight: 0.5,
    image_weight: 0.5,
    threshold: 0.2,
    use_dynamic_retrieval: true,
    adaptive_scoring: true,
    enable_query_expansion: true,
    use_enhanced: true,
};

export const useSearch = (
    options?: Omit<UseMutationOptions<QueryResponse, Error, QueryRequest>, 'mutationFn' | 'mutationKey'>
) => {
    return useMutation({
        mutationFn: async (params: QueryRequest) => {
            const mergedParams = { ...DEFAULT_SEARCH_OPTIONS, ...params };
            return await searchAPI.search(mergedParams);
        },
        mutationKey: searchKeys.queries(),
        ...options,
    });
};

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { searchAPI } from '@/api/search';
import type { QueryRequest, QueryResponse } from '@/types/search.types';

export const searchKeys = {
    all: ['search'] as const,
    queries: () => [...searchKeys.all, 'query'] as const,
    query: (params: QueryRequest) => [...searchKeys.queries(), params] as const,
};

export const useSearch = (
    options?: Omit<UseMutationOptions<QueryResponse, Error, QueryRequest>, 'mutationFn' | 'mutationKey'>
) => {
    return useMutation({
        mutationFn: async (params: QueryRequest) => {
            return await searchAPI.search(params);
        },
        mutationKey: searchKeys.queries(),
        ...options,
    });
};

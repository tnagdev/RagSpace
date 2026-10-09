import { useMutation } from '@tanstack/react-query';
import { type ScopedSearch, searchAPI } from '@/api/search';

export const searchKeys = {
    all: ['search'] as const,
};

// A mutation because each search is a user action, not cached state.
export const useSearch = () =>
    useMutation({
        mutationKey: searchKeys.all,
        mutationFn: (request: ScopedSearch) => searchAPI.searchScoped(request),
    });

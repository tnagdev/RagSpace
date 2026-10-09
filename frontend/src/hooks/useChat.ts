import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ConversationFilter, chatAPI } from '@/api/chat';

export const chatKeys = {
    all: ['chats'] as const,
    conversations: () => [...chatKeys.all, 'conversations'] as const,
    list: (filter: ConversationFilter) => [...chatKeys.conversations(), 'list', filter] as const,
    conversation: (id: string) => [...chatKeys.conversations(), id] as const,
    messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
    greeting: () => [...chatKeys.all, 'greeting'] as const,
};

export const useConversations = (filter: ConversationFilter = {}) =>
    useInfiniteQuery({
        queryKey: chatKeys.list(filter),
        queryFn: ({ pageParam }) => chatAPI.conversations(filter, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

export const useConversation = (conversationId: string | undefined) =>
    useQuery({
        queryKey: chatKeys.conversation(conversationId ?? ''),
        queryFn: () => chatAPI.conversation(conversationId!),
        enabled: !!conversationId,
    });

// Newest first from the API; pages load further back in time.
export const useMessages = (conversationId: string | undefined) =>
    useInfiniteQuery({
        queryKey: chatKeys.messages(conversationId ?? ''),
        queryFn: ({ pageParam }) => chatAPI.messages(conversationId!, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled: !!conversationId,
    });

export const useCreateConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (scope: ConversationFilter = {}) => chatAPI.create(scope),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.conversations() }),
    });
};

export const useDeleteConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (conversationId: string) => chatAPI.remove(conversationId),
        onSuccess: (_data, conversationId) => {
            queryClient.removeQueries({ queryKey: chatKeys.messages(conversationId) });
            queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
};

export const useGreeting = () =>
    useQuery({ queryKey: chatKeys.greeting(), queryFn: chatAPI.greeting, staleTime: 30 * 60_000, retry: false });

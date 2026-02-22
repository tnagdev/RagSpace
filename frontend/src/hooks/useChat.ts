import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatAPI } from '@/api/chat';
import type { ChatRequest } from '@/types/chat.types';

export const chatKeys = {
    all: ['chats'] as const,
    conversations: () => [...chatKeys.all, 'conversations'] as const,
    conversation: (id: string) => [...chatKeys.conversations(), id] as const,
};

export const useConversations = (params?: { file_id?: string; collection_id?: string }) => {
    return useQuery({
        queryKey: [...chatKeys.conversations(), params],
        queryFn: async () => {
            const response = await chatAPI.getConversations(params);
            return response.data;
        },
    });
};

export const useConversation = (conversationId: string | undefined) => {
    return useQuery({
        queryKey: chatKeys.conversation(conversationId || ''),
        queryFn: async () => {
            if (!conversationId) return null;
            const response = await chatAPI.getConversation(conversationId);
            return response.data;
        },
        enabled: !!conversationId,
    });
};

export const useDeleteConversation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (conversationId: string) => chatAPI.deleteConversation(conversationId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
};

export const useSendMessage = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: ChatRequest) => chatAPI.sendMessage(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
        },
    });
};

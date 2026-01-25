import { privateAxios, API_BASE_URL } from './apiClient';
import type { ConversationSummary, Conversation, ChatRequest } from '@/types/chat.types';

export const chatAPI = {
    // Get all conversations
    getConversations: async () =>
        privateAxios.get<ConversationSummary[]>('/api/conversations'),

    // Get specific conversation
    getConversation: async (conversationId: string) =>
        privateAxios.get<Conversation>(`/api/conversations/${conversationId}`),

    // Delete conversation
    deleteConversation: async (conversationId: string) =>
        privateAxios.delete(`/api/conversations/${conversationId}`),

    // Send chat message (SSE streaming)
    sendMessage: (payload: ChatRequest) => {
        const url = `${API_BASE_URL}/api/chat`;

        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
    },
};

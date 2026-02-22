import { privateAxios, API_BASE_URL } from './apiClient';
import type { ConversationSummary, Conversation, ChatRequest, ChatSSEEvent, GreetingResponse } from '@/types/chat.types';

export const chatAPI = {
    // Get all conversations with optional filtering
    getConversations: async (params?: { file_id?: string; collection_id?: string }) =>
        privateAxios.get<ConversationSummary[]>('/api/conversations', { params }),

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

    // Stream chat with callback handler
    streamChat: async (payload: ChatRequest, onEvent: (event: ChatSSEEvent) => void) => {
        const response = await chatAPI.sendMessage(payload);

        if (!response.ok) {
            throw new Error('Failed to send message');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('No response stream');
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const event: ChatSSEEvent = JSON.parse(data);
                    onEvent(event);
                } catch (e) {
                    console.error('Failed to parse SSE event:', e);
                }
            }
        }
    },

    // Get personalised AI greeting grounded in the user's file library
    getGreeting: async (): Promise<GreetingResponse> => {
        const response = await privateAxios.get<GreetingResponse>('/api/greeting');
        return response.data;
    },
};

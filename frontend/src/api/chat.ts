import { API_BASE_URL, api, idempotencyKey, readSse, unwrap } from './client';
import type { ChatStreamEvent, Conversation, Message, Page } from './types';

export interface ConversationFilter {
    fileId?: string;
    collectionId?: string;
}

export const chatAPI = {
    conversations: (filter: ConversationFilter = {}, cursor?: string): Promise<Page<Conversation>> =>
        unwrap(api.GET('/conversations', { params: { query: { ...filter, limit: 50, cursor } } })),
    conversation: (conversationId: string) =>
        unwrap(api.GET('/conversations/{conversationId}', { params: { path: { conversationId } } })),
    create: (scope: ConversationFilter = {}) =>
        unwrap(api.POST('/conversations', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body: scope })),
    remove: (conversationId: string) =>
        unwrap(api.DELETE('/conversations/{conversationId}', { params: { path: { conversationId } } })),
    messages: (conversationId: string, cursor?: string): Promise<Page<Message>> =>
        unwrap(
            api.GET('/conversations/{conversationId}/messages', {
                params: { path: { conversationId }, query: { limit: 50, cursor } },
            }),
        ),
    greeting: async () => (await unwrap(api.GET('/assistant/greeting'))).greeting,

    // Streams the reply; a retry with the same key replays the stored answer instead of re-asking the model.
    send: async function* (
        conversationId: string,
        body: { content: string; fileIds?: string[] },
        options: { key?: string; signal?: AbortSignal } = {},
    ): AsyncGenerator<ChatStreamEvent> {
        const response = await fetch(`${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                'Idempotency-Key': options.key ?? idempotencyKey(),
            },
            body: JSON.stringify(body),
            signal: options.signal,
        });
        for await (const message of readSse(response)) {
            yield JSON.parse(message.data) as ChatStreamEvent;
        }
    },
};

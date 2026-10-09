import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type ConversationFilter, chatAPI } from '@/api/chat';
import type { ApiFile, SearchHit } from '@/api/types';
import { type ChatTurn, toTurns } from '@/types/chat';
import { chatKeys, useCreateConversation, useMessages } from './useChat';

const TOOL_LABELS: Record<string, string> = {
    get_video_content: 'Analyzing video scenes...',
    search_files: 'Searching your library...',
    get_file_content: 'Analyzing file content...',
};

export interface StreamState {
    active: boolean;
    text: string;
    hits: SearchHit[];
    label: string;
}

const IDLE: StreamState = { active: false, text: '', hits: [], label: '' };

interface Options {
    conversationId?: string;
    scope?: ConversationFilter;
    // Called once a reply to a brand-new conversation has finished streaming.
    onConversationCreated?: (conversationId: string) => void;
}

export function useChatSession({ conversationId, scope = {}, onConversationCreated }: Options) {
    const queryClient = useQueryClient();
    const createConversation = useCreateConversation();
    const messages = useMessages(conversationId);
    const [pending, setPending] = useState<ChatTurn[]>([]);
    const [stream, setStream] = useState<StreamState>(IDLE);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const persisted = useMemo(
        () => toTurns((messages.data?.pages ?? []).flatMap((page) => page.items)),
        [messages.data],
    );

    // Optimistic turns give way once the server history contains the streamed reply.
    useEffect(() => {
        const reply = pending[pending.length - 1];
        if (reply?.id && persisted.some((turn) => turn.id === reply.id)) setPending([]);
    }, [persisted, pending]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const send = useCallback(
        async (
            content: string,
            options: { fileIds?: string[]; attachedFiles?: ApiFile[]; scope?: ConversationFilter } = {},
        ) => {
            if (!content.trim() || stream.active) return;
            const userTurn: ChatTurn = {
                role: 'user',
                content,
                attachedFiles: options.attachedFiles?.length ? options.attachedFiles : undefined,
            };
            setError(null);
            setPending([userTurn]);
            setStream({ active: true, text: '', hits: [], label: 'Thinking...' });
            const abort = new AbortController();
            abortRef.current = abort;

            let text = '';
            const hits: SearchHit[] = [];
            try {
                const id = conversationId ?? (await createConversation.mutateAsync(options.scope ?? scope)).id;
                let messageId: string | undefined;
                const fileIds = options.fileIds?.length ? options.fileIds : undefined;
                for await (const event of chatAPI.send(id, { content, fileIds }, { signal: abort.signal })) {
                    switch (event.type) {
                        case 'step':
                            if (event.status === 'STARTED') setStream((s) => ({ ...s, label: event.label }));
                            break;
                        case 'tool':
                            if (event.status === 'STARTED' && TOOL_LABELS[event.tool]) {
                                setStream((s) => ({ ...s, label: TOOL_LABELS[event.tool] }));
                            }
                            break;
                        case 'results':
                            hits.push(...event.hits);
                            setStream((s) => ({ ...s, hits: [...hits] }));
                            break;
                        case 'delta':
                            text += event.text;
                            setStream((s) => ({ ...s, text }));
                            break;
                        case 'done':
                            messageId = event.messageId;
                            break;
                        case 'error':
                            throw new Error(event.message);
                    }
                }
                setPending([userTurn, { id: messageId, role: 'assistant', content: text, hits }]);
                queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
                if (conversationId) {
                    await queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
                } else {
                    onConversationCreated?.(id);
                }
            } catch (err) {
                if (!abort.signal.aborted) {
                    setError(err instanceof Error ? err.message : 'Failed to send message');
                    setPending([]);
                }
            } finally {
                setStream(IDLE);
            }
        },
        [conversationId, scope, stream.active, createConversation, queryClient, onConversationCreated],
    );

    return {
        turns: [...persisted, ...pending],
        stream,
        error,
        setError,
        send,
        isLoading: messages.isLoading,
        hasOlder: messages.hasNextPage,
        loadOlder: messages.fetchNextPage,
    };
}

import type { ApiFile, Message, SearchHit } from '@/api/types';

export interface ChatTurn {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    hits?: SearchHit[];
    attachedFiles?: ApiFile[];
}

// The API pages messages newest first; the transcript reads oldest first.
export function toTurns(messages: Message[]): ChatTurn[] {
    return [...messages].reverse().map((message) => ({
        id: message.id,
        role: message.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: message.content,
        timestamp: message.createdAt,
        hits: message.hits,
    }));
}

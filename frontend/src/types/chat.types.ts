export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    searchResults?: SearchResult[];
    fileIds?: string[];
}

export interface SearchResult {
    file_id: string;
    scene_id?: string;
    file_name: string;
    score: number;
    timestamp?: number;
    // S3 keys and buckets (permanent storage)
    thumbnail_s3_key?: string;
    thumbnail_s3_bucket?: string;
    file_s3_key?: string;
    file_s3_bucket?: string;
    // Signed URLs (generated on request)
    thumbnail_url?: string;
    file_url?: string;
    start_time?: number;
    end_time?: number;
    text_content?: string;
}

export interface ChatRequest {
    message: string;
    conversation_id?: string;
    file_ids?: string[];
    max_results?: number;
    include_context?: boolean;
}

export interface ChatMetadata {
    type: 'metadata';
    conversation_id: string;
    results: SearchResult[];
    context_used: boolean;
}

export interface ChatContent {
    type: 'content';
    content: string;
}

export interface ChatDone {
    type: 'done';
    conversation_id: string;
}

export interface ChatError {
    type: 'error';
    error: string;
}

export type ChatSSEEvent = ChatMetadata | ChatContent | ChatDone | ChatError;

export interface ConversationSummary {
    id: string;
    title: string | null;
    last_message: string;
    message_count: number;
    created_at: string;
    updated_at: string;
}

export interface Conversation {
    id: string;
    user_id: string;
    messages: ChatMessage[];
    created_at: string;
    updated_at: string;
    title: string | null;
}

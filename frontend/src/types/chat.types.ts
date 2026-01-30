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
    youtube_url?: string;
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
    results?: SearchResult[];
    context_used?: boolean;
    mode?: 'agentic' | 'direct_search';
}

export interface ChatContent {
    type: 'content';
    content: string;
}

export interface ChatResults {
    type: 'results';
    results: SearchResult[];
}

export interface ChatToolStart {
    type: 'tool_start';
    tool: string;
    arguments: string;
}

export interface ChatToolResult {
    type: 'tool_result';
    tool: string;
    results: SearchResult[];
    result_count: number;
}

export interface ChatDone {
    type: 'done';
    conversation_id: string;
    tools_used?: string[];
    result_count?: number;
}

export interface ChatError {
    type: 'error';
    error: string;
}

export type ChatSSEEvent = ChatMetadata | ChatContent | ChatResults | ChatToolStart | ChatToolResult | ChatDone | ChatError;

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

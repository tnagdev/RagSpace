import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileResponseDto } from '@/types/upload.types';
import { SearchResult, ChatSSEEvent } from '@/types/chat.types';
import { useConversations, useConversation } from '@/hooks/useChat';
import { chatAPI } from '@/api/chat';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import FileAttachments from './components/FileAttachments';
import FilePickerModal from '../search/components/FilePickerModal';
import { IconButton } from '@/components/IconButton';
import Markdown from '@/components/Markdown';
import { AlertCircle, MessageSquare, Film, X } from 'lucide-react';

const ChatPage: React.FC = () => {
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as { conversation_id?: string };
    const currentConversationId = searchParams.conversation_id;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [attachedFiles, setAttachedFiles] = useState<FileResponseDto[]>([]);
    const [selectedResult, setSelectedResult] = useState<SearchResult | undefined>();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; searchResults?: SearchResult[] }>>([]);
    const [streamingMessage, setStreamingMessage] = useState<string>('');
    const [streamingResults, setStreamingResults] = useState<SearchResult[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const conversationsQuery = useConversations();
    const conversationQuery = useConversation(currentConversationId);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    // Load conversation messages when selected or clear when new chat
    useEffect(() => {
        if (conversationQuery.data?.messages) {
            setMessages(conversationQuery.data.messages);
        } else if (!currentConversationId) {
            setMessages([]);
            setAttachedFiles([]);
            setError(null);
        }
    }, [conversationQuery.data, currentConversationId]);

    const handleSendMessage = async (message: string) => {
        if (!message.trim() || isStreaming) return;

        setError(null);
        setIsStreaming(true);
        setStreamingMessage('');
        setStreamingResults([]);

        // Add user message immediately
        const userMessage = { role: 'user' as const, content: message };
        setMessages(prev => [...prev, userMessage]);

        // Prepare payload
        const payload = {
            message,
            conversation_id: currentConversationId,
            file_ids: attachedFiles.length > 0 ? attachedFiles.map(f => f.id) : undefined,
            max_results: 10,
            include_context: true,
        };

        try {
            const response = await chatAPI.sendMessage(payload);

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('No response stream');
            }

            let assistantMessage = '';
            let conversationId = currentConversationId;
            let messageSearchResults: SearchResult[] = [];

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

                        if (event.type === 'metadata') {
                            conversationId = event.conversation_id;
                            navigate({ to: '/chat', search: { conversation_id: conversationId }, replace: true });
                            // Handle results if present (direct_search mode) - show immediately
                            if (event.results && event.results.length > 0) {
                                messageSearchResults = event.results;
                                setStreamingResults(event.results);
                            }
                        } else if (event.type === 'results' || event.type === 'tool_result') {
                            // Handle search results from agentic mode - show immediately
                            messageSearchResults = [...messageSearchResults, ...event.results];
                            setStreamingResults(prev => [...prev, ...event.results]);
                        } else if (event.type === 'tool_start') {
                            // Tool is being executed - could show loading indicator
                            console.log('Tool started:', event.tool);
                        } else if (event.type === 'content') {
                            assistantMessage += event.content;
                            setStreamingMessage(assistantMessage);
                        } else if (event.type === 'done') {
                            conversationId = event.conversation_id;
                            navigate({ to: '/chat', search: { conversation_id: conversationId }, replace: true });
                            // Add the complete assistant message with search results
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: assistantMessage,
                                searchResults: messageSearchResults
                            }]);
                            setStreamingMessage('');
                            setStreamingResults([]);
                        } else if (event.type === 'error') {
                            setError(event.error);
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE event:', e);
                    }
                }
            }

            // Refresh conversations list
            conversationsQuery.refetch();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
            setStreamingMessage('');
            // Remove the user message on error
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsStreaming(false);
        }
    };

    const handleRemoveFile = (fileId: string) => {
        setAttachedFiles(files => files.filter(f => f.id !== fileId));
    };

    const handleSelectFiles = (files: FileResponseDto[]) => {
        setAttachedFiles(files);
    };

    const handleResultClick = (result: SearchResult) => {
        setSelectedResult(result);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex gap-6 min-h-0">
                {/* Left Panel - Chat */}
                <div className={`flex flex-col h-full transition-all duration-300 ${selectedResult ? 'w-1/2' : 'w-full'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-1">Chat</h1>
                            <p className="text-sm text-text-secondary">
                                Ask questions about your media library
                            </p>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-text-secondary">
                                    <MessageSquare size={48} className="mb-4 opacity-50" />
                                    <p>Start a conversation or select one from the sidebar</p>
                                </div>
                            ) : (
                                <>
                                    <MessageList
                                        messages={messages}
                                        onResultClick={handleResultClick}
                                    />
                                    {/* Show streaming message */}
                                    {(streamingMessage || streamingResults.length > 0) && (
                                        <div className="flex gap-3 justify-start mb-4">
                                            <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                                                <MessageSquare size={18} className="text-accent-primary" />
                                            </div>
                                            <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-bg-tertiary text-white border border-border">
                                                {streamingMessage ? (
                                                    <div className="text-sm break-words">
                                                        <Markdown content={streamingMessage} />
                                                        <span className="inline-block w-1 h-4 bg-accent-primary ml-1 animate-pulse" />
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-text-secondary flex items-center gap-2">
                                                        <span className="inline-block w-2 h-2 bg-accent-primary rounded-full animate-pulse" />
                                                        Searching...
                                                    </div>
                                                )}

                                                {/* Show streaming results */}
                                                {streamingResults.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-border/50">
                                                        <div className="text-xs font-semibold text-text-secondary mb-3">
                                                            Found Results ({streamingResults.length})
                                                        </div>
                                                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                                            <div className="grid grid-cols-4 gap-2">
                                                                {streamingResults.map((result, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => handleResultClick(result)}
                                                                        className="text-left p-2 rounded bg-bg-secondary hover:bg-bg-tertiary 
                                                                                 border border-border/50 hover:border-accent-primary/50 
                                                                                 transition-all duration-200 group max-w-full"
                                                                    >
                                                                        <div className="flex items-start gap-2">
                                                                            {result.thumbnail_url ? (
                                                                                <img
                                                                                    src={result.thumbnail_url}
                                                                                    alt={result.file_name}
                                                                                    className="w-12 h-12 object-cover rounded shrink-0"
                                                                                />
                                                                            ) : (
                                                                                <div className="w-12 h-12 bg-bg-tertiary rounded flex items-center justify-center shrink-0">
                                                                                    <Film size={16} className="text-text-secondary" />
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="text-xs font-medium text-white truncate group-hover:text-accent-primary transition-colors">
                                                                                    {result.file_name}
                                                                                </div>
                                                                                {(result.start_time !== undefined || result.timestamp !== undefined) && (
                                                                                    <div className="text-xs text-text-secondary">
                                                                                        {Math.floor(result.start_time || result.timestamp || 0)}s
                                                                                    </div>
                                                                                )}
                                                                                <div className="text-xs text-text-secondary/70">
                                                                                    {(result.score * 100).toFixed(1)}%
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>

                        {/* Floating Input Widget */}
                        <div className="sticky bottom-0 w-xl m-auto pt-3">
                            <div className="bg-bg-secondary rounded-full border border-border shadow-2xl backdrop-blur-xl">
                                {/* Error Display */}
                                {error && (
                                    <div className="mx-4 mt-4 p-3 rounded-lg bg-danger/10 border border-danger flex items-start gap-3">
                                        <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
                                        <div>
                                            <div className="text-sm font-medium text-danger">Error</div>
                                            <div className="text-xs text-text-secondary mt-0.5">{error}</div>
                                        </div>
                                    </div>
                                )}

                                {/* File Attachments */}
                                {attachedFiles.length > 0 && (
                                    <div className="mx-4 mt-4">
                                        <FileAttachments
                                            files={attachedFiles}
                                            onRemoveFile={handleRemoveFile}
                                        />
                                    </div>
                                )}

                                {/* Input */}
                                <div className="p-3 px-4">
                                    <ChatInput
                                        onSendMessage={handleSendMessage}
                                        onAttachFiles={() => setIsFilePickerOpen(true)}
                                        isLoading={isStreaming}
                                        disabled={isStreaming}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Preview (only show when result selected) */}
                {selectedResult && (
                    <div className="w-1/2 flex flex-col h-full animate-in slide-in-from-right duration-300">
                        <div className="mb-6 flex-shrink-0 flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-white mb-1">Preview</h2>
                                <p className="text-sm text-text-secondary">
                                    Click on any result to preview
                                </p>
                            </div>
                            <IconButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedResult(undefined)}
                                icon={<X size={20} />}
                                className="text-text-secondary hover:text-white"
                            />
                        </div>

                        <div className="flex-1 bg-bg-secondary rounded-lg border border-border overflow-hidden min-h-0">
                            <div className="h-full overflow-y-auto custom-scrollbar">
                                {selectedResult.file_url ? (
                                    <div className="p-4">
                                        <img
                                            src={selectedResult.file_url}
                                            alt={selectedResult.file_name}
                                            className="w-full rounded-lg"
                                        />
                                        <div className="mt-4">
                                            <h3 className="text-lg font-semibold text-white mb-2">
                                                {selectedResult.file_name}
                                            </h3>
                                            {selectedResult.timestamp !== undefined && (
                                                <p className="text-sm text-text-secondary mb-2">
                                                    Timestamp: {Math.floor(selectedResult.timestamp)}s
                                                </p>
                                            )}
                                            <p className="text-sm text-text-secondary mb-2">
                                                Score: {(selectedResult.score * 100).toFixed(1)}%
                                            </p>
                                            {selectedResult.text_content && (
                                                <p className="text-sm text-white mt-4">
                                                    {selectedResult.text_content}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-text-secondary">
                                        <p>No preview available</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelectFiles={handleSelectFiles}
                selectedFileIds={attachedFiles.map(f => f.id)}
            />
        </div>
    );
};

export default ChatPage;

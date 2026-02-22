import { type FC, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearch } from '@tanstack/react-router';
import { FileVideo, FileImage, FileAudio, FileText, File, Youtube, ArrowLeft, Calendar, HardDrive, Clock, AlertCircle, MessageSquare, Plus, Bot, Eye, Download, ExternalLink, X, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import moment from 'moment';
import { useFile } from '@/hooks/useUpload';
import { useConversations, useConversation } from '@/hooks/useChat';
import { chatAPI } from '@/api/chat';
import { ChatSSEEvent, SearchResult } from '@/types/chat.types';
import { QueryResult } from '@/types/search.types';
import { FileType } from '@/types/upload.types';
import Button from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import ConversationList from '@/pages/chat/components/ConversationList';
import MessageList from '@/pages/chat/components/MessageList';
import ChatInput from '@/pages/chat/components/ChatInput';
import Loader from '@/components/Loader';
import Markdown from '@/components/Markdown';
import VideoPreview from '../search/components/VideoPreview';
import ImagePreview from '../search/components/ImagePreview';
import YouTubePlayer from '../search/components/YouTubePlayer';

const fileTypeConfig: Record<FileType, {
    icon: typeof FileVideo;
    color: string;
    bgGradient: string;
}> = {
    VIDEO: { icon: FileVideo, color: 'text-blue-400', bgGradient: 'from-blue-500/10 to-blue-600/5' },
    YOUTUBE_VIDEO: { icon: Youtube, color: 'text-red-400', bgGradient: 'from-red-500/10 to-red-600/5' },
    IMAGE: { icon: FileImage, color: 'text-green-400', bgGradient: 'from-green-500/10 to-green-600/5' },
    AUDIO: { icon: FileAudio, color: 'text-purple-400', bgGradient: 'from-purple-500/10 to-purple-600/5' },
    DOCUMENT: { icon: FileText, color: 'text-orange-400', bgGradient: 'from-orange-500/10 to-orange-600/5' },
    OTHER: { icon: File, color: 'text-gray-400', bgGradient: 'from-gray-500/10 to-gray-600/5' },
};

// Helper function to convert SearchResult to QueryResult for preview components
const convertToQueryResult = (result: SearchResult): QueryResult => {
    const fileType = result.file_url?.includes('video') || result.file_name?.match(/\.(mp4|webm|mov|avi)$/i) ? 'video' : 'image';
    
    return {
        file_id: result.file_id,
        file_name: result.file_name,
        file_type: fileType,
        score: result.score,
        confidence: result.score,
        text_score: 0,
        image_score: result.score,
        start_time: result.start_time,
        end_time: result.end_time,
        text: result.text_content,
        file_details: {
            id: result.file_id,
            fileName: result.file_name,
            fileType: fileType,
            url: result.file_url,
            thumbnailUrl: result.thumbnail_url,
            youtubeUrl: result.youtube_url,
        },
        scene_details: result.start_time !== undefined ? {
            sceneNumber: 0,
            startTime: result.start_time || 0,
            endTime: result.end_time || 0,
            startFrame: 0,
            endFrame: 0,
            keyframe: 0,
            duration: (result.end_time || 0) - (result.start_time || 0),
            thumbnailUrl: result.thumbnail_url,
        } : undefined,
    };
};

const FileChatPage: FC = () => {
    const { id: fileId } = useParams({ strict: false }) as { id: string };
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as { conversation_id?: string };
    const currentConversationId = searchParams.conversation_id;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; searchResults?: SearchResult[] }>>([]);
    const [streamingMessage, setStreamingMessage] = useState<string>('');
    const [streamingResults, setStreamingResults] = useState<SearchResult[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedResult, setSelectedResult] = useState<SearchResult | undefined>();
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

    const fileQuery = useFile(fileId);
    const conversationsQuery = useConversations();
    const conversationQuery = useConversation(currentConversationId);

    const file = fileQuery.data;
    const config = file ? fileTypeConfig[file.fileType] : null;
    const Icon = config?.icon;

    // Filter conversations for this file
    const fileConversations = conversationsQuery.data?.filter(conv => conv.file_id === fileId) || [];

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    // Load conversation messages
    useEffect(() => {
        if (conversationQuery.data?.messages) {
            const formattedMessages = conversationQuery.data.messages.map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                searchResults: msg.searchResults,
                timestamp: msg.timestamp,
            }));
            setMessages(formattedMessages);
        } else if (!currentConversationId) {
            setMessages([]);
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
            file_ids: [fileId],
            file_id: fileId,
            max_results: 5,
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
                            // Only navigate if conversation_id changed to avoid re-rendering
                            if (conversationId !== currentConversationId) {
                                navigate({ to: `/files/${fileId}/chat`, search: { conversation_id: conversationId }, replace: true });
                            }
                            // Handle results if present (direct_search mode)
                            if (event.results && event.results.length > 0) {
                                messageSearchResults = event.results;
                                setStreamingResults(event.results);
                            }
                        } else if (event.type === 'results' || event.type === 'tool_result') {
                            // Handle search results from agentic mode
                            messageSearchResults = [...messageSearchResults, ...event.results];
                            setStreamingResults(prev => [...prev, ...event.results]);
                        } else if (event.type === 'tool_start') {
                            console.log('Tool started:', event.tool);
                        } else if (event.type === 'content') {
                            assistantMessage += event.content;
                            setStreamingMessage(assistantMessage);
                        } else if (event.type === 'done') {
                            conversationId = event.conversation_id || conversationId;
                            // Only navigate if conversation_id changed
                            if (conversationId && conversationId !== currentConversationId) {
                                navigate({ to: `/files/${fileId}/chat`, search: { conversation_id: conversationId }, replace: true });
                            }
                            // Add the complete assistant message with search results
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: assistantMessage,
                                searchResults: event.results || messageSearchResults
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

    const handleNewChat = () => {
        setMessages([]);
        setError(null);
        navigate({ to: `/files/${fileId}/chat`, search: {}, replace: true });
    };

    const handleSelectConversation = (conversationId: string) => {
        setIsLeftPanelCollapsed(true);
        navigate({ to: `/files/${fileId}/chat`, search: { conversation_id: conversationId } });
    };

    const handleResultClick = (result: SearchResult) => {
        setSelectedResult(result);
        setIsLeftPanelCollapsed(true);
    };

    if (fileQuery.isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader size="lg" />
            </div>
        );
    }

    if (!file) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-text-secondary">File not found</p>
                    <Button onClick={() => navigate({ to: '/files' })} className="mt-4">
                        Go to Files
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-6 h-full">
            {/* Left Panel - File Details & Conversations */}
            <div className={`flex flex-col gap-4 transition-all duration-300 ${
                isLeftPanelCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-80 opacity-100'
            }`}>
                {/* Back Button */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: '/files' })}
                    icon={<ArrowLeft size={16} />}
                    className="w-fit"
                >
                    Back to Files
                </Button>

                {/* File Details Card */}
                <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden backdrop-blur-sm">
                    {/* File Info */}
                    <div className="p-4 space-y-4">
                        {/* Thumbnail and Title */}
                        <div className="flex gap-3">
                            {/* Thumbnail */}
                            <div className="shrink-0">
                                {file.thumbnailUrl ? (
                                    <img 
                                        src={file.thumbnailUrl} 
                                        alt={file.originalFilename}
                                        className="w-16 h-16 rounded-lg object-cover border border-border/50"
                                    />
                                ) : (
                                    <div className={`w-16 h-16 rounded-lg bg-gradient-to-br ${config?.bgGradient} flex items-center justify-center border border-border/50`}>
                                        {Icon && <Icon className={`w-7 h-7 ${config?.color}`} />}
                                    </div>
                                )}
                            </div>

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-text-primary truncate mb-1.5" title={file.originalFilename}>
                                    {file.originalFilename}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                                    <span className="px-2 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary font-medium">
                                        {file.fileType.replace('_', ' ')}
                                    </span>
                                    <span>{(file.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-text-secondary mt-1.5">
                                    <Clock size={11} className="shrink-0 opacity-60" />
                                    <span>{moment(file.uploadedAt).fromNow()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            {file.s3Url && (
                                <button
                                    onClick={() => window.open(file.s3Url, '_blank')}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary hover:bg-accent-primary/10 border border-border hover:border-accent-primary/50 text-text-secondary hover:text-accent-primary transition-all text-xs font-medium"
                                >
                                    <Eye size={14} />
                                    View
                                </button>
                            )}
                            {file.s3Url && (
                                <button
                                    onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = file.s3Url;
                                        a.download = file.originalFilename;
                                        a.click();
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary hover:bg-accent-primary/10 border border-border hover:border-accent-primary/50 text-text-secondary hover:text-accent-primary transition-all text-xs font-medium"
                                >
                                    <Download size={14} />
                                    Download
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Conversations List */}
                <div className="flex-1 overflow-hidden">
                    <ConversationList
                        conversations={fileConversations}
                        currentConversationId={currentConversationId}
                        onSelectConversation={handleSelectConversation}
                        onNewChat={handleNewChat}
                        isLoading={conversationsQuery.isLoading}
                    />
                </div>
            </div>

            {/* Collapse/Expand Toggle Button */}
            <button
                onClick={() => {
                    if (isLeftPanelCollapsed) {
                        setIsLeftPanelCollapsed(false);
                        setSelectedResult(undefined);
                    } else {
                        setIsLeftPanelCollapsed(true);
                    }
                }}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-accent-primary rounded-r-lg p-1.5 hover:bg-accent-primary/80 transition-all duration-200 shadow-lg"
                style={{ left: isLeftPanelCollapsed ? '0' : 'calc(20rem + 1.5rem)' }}
                title={isLeftPanelCollapsed ? 'Expand file info' : 'Collapse file info'}
            >
                {isLeftPanelCollapsed ? (
                    <ChevronRight size={18} className="text-white" />
                ) : (
                    <ChevronLeft size={18} className="text-white" />
                )}
            </button>

            {/* Middle Panel - Chat Interface */}
            <div className="flex-1 flex gap-6 min-h-0">
                <div className={`flex flex-col h-full transition-all duration-300 ${selectedResult ? 'w-1/2' : 'w-full'}`}>
                {/* Chat Header */}
                <div className="mb-6 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h1 className="text-2xl font-bold text-text-primary">
                                {currentConversationId ? 'Conversation' : 'New Chat'}
                            </h1>
                            <p className="text-sm text-text-secondary">
                                Ask questions about {file.originalFilename}
                            </p>
                        </div>
                        {currentConversationId && (
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Plus className="w-4 h-4" />}
                                onClick={handleNewChat}
                            >
                                New Chat
                            </Button>
                        )}
                    </div>
                    <p className="text-sm text-text-secondary">
                        {fileConversations.length} {fileConversations.length === 1 ? 'conversation' : 'conversations'}
                    </p>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col min-h-0 relative">
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                        {messages.length === 0 && !streamingMessage ? (
                            <div className="h-full flex flex-col items-center justify-center text-text-secondary">
                                <MessageSquare size={48} className="mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold text-text-primary mb-2">
                                    Chat about this file
                                </h3>
                                <p className="text-text-secondary text-sm">
                                    Ask questions, get insights, or search through the content of {file.originalFilename}
                                </p>
                            </div>
                        ) : (
                            <>
                                <MessageList messages={messages} onResultClick={handleResultClick} />
                                {streamingMessage && (
                                    <div className="flex gap-3 justify-start mt-4">
                                        <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                                            <Bot size={18} className="text-accent-primary" />
                                        </div>
                                        <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-bg-tertiary text-white border border-border">
                                            <div className="text-sm break-words">
                                                <Markdown content={streamingMessage} />
                                                <span className="inline-block w-1 h-4 bg-accent-primary ml-1 animate-pulse" />
                                            </div>

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
                            </>
                        )}
                        <div ref={messagesEndRef} />
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

                            {/* Input */}
                            <div className="p-3 px-4">
                                <ChatInput
                                    onSendMessage={handleSendMessage}
                                    onAttachFiles={() => { }}
                                    isLoading={isStreaming}
                                    disabled={isStreaming || file.processingStatus !== 'COMPLETED'}
                                    hideAttachment
                                />
                                {file.processingStatus !== 'COMPLETED' && (
                                    <p className="text-xs text-text-secondary mt-2">
                                        This file is still processing. Chat will be enabled once processing is complete.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                </div>

                {/* Right Panel - Preview (only show when result selected) */}
                {selectedResult && (
                    <div className="w-1/2 flex flex-col h-full animate-in slide-in-from-right duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6 shrink-0">
                            <div>
                                <h1 className="text-2xl font-bold text-white mb-1">Preview</h1>
                                <p className="text-sm text-text-secondary">
                                    {selectedResult.start_time !== undefined
                                        ? `Scene at ${Math.floor(selectedResult.start_time)}s`
                                        : 'Click on any result to preview'}
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

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {(() => {
                                const queryResult = convertToQueryResult(selectedResult);
                                const youtubeUrl = selectedResult.youtube_url;
                                const isYouTubeVideo = !!youtubeUrl;
                                const isVideo = queryResult.file_type === 'video' ||
                                    selectedResult.file_name?.match(/\.(mp4|webm|mov|avi)$/i);

                                if (isYouTubeVideo && youtubeUrl) {
                                    return <YouTubePlayer result={queryResult} youtubeUrl={youtubeUrl} />;
                                } else if (isVideo) {
                                    return <VideoPreview result={queryResult} />;
                                } else {
                                    return <ImagePreview result={queryResult} />;
                                }
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileChatPage;

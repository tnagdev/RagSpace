import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileResponseDto, FileType } from '@/types/upload.types';
import { SearchResult, ChatSSEEvent } from '@/types/chat.types';
import { QueryResult } from '@/types/search.types';
import { Collection, CollectionAttachment } from '@/types/collection.types';
import { useConversations, useConversation } from '@/hooks/useChat';
import { chatAPI } from '@/api/chat';
import { uploadAPI } from '@/api/upload';
import { collectionAPI } from '@/api/collection';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import ConversationList from './components/ConversationList';
import Attachments from '@/components/Attachments';
import Popover from '@/components/Popover';
import FilePickerModal from '../search/components/FilePickerModal';
import CollectionPickerModal from '../search/components/CollectionPickerModal';
import VideoPreview from '../search/components/VideoPreview';
import ImagePreview from '../search/components/ImagePreview';
import YouTubePlayer from '../search/components/YouTubePlayer';
import Button from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { RefreshCw, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import Markdown from '@/components/Markdown';
import { AlertCircle, MessageSquare, Film, X, Folder, FilePlus } from 'lucide-react';

// Helper function to convert SearchResult to QueryResult for preview components
const convertToQueryResult = (result: SearchResult): QueryResult => {
    return {
        file_id: result.file_id,
        file_name: result.file_name,
        file_type: result.file_url?.includes('video') || result.file_name?.match(/\.(mp4|webm|mov|avi)$/i) ? 'video' : 'image',
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
            fileType: result.file_url?.includes('video') || result.file_name?.match(/\.(mp4|webm|mov|avi)$/i) ? 'video' : 'image',
            url: result.file_url,
            thumbnailUrl: result.thumbnail_url,
            youtubeUrl: result.youtube_url,
        },
        scene_details: result.start_time !== undefined ? {
            sceneNumber: 1,
            startTime: result.start_time ?? 0,
            endTime: result.end_time ?? 0,
            startFrame: 0,
            endFrame: 0,
            keyframe: 0,
            duration: (result.end_time ?? 0) - (result.start_time ?? 0),
            thumbnailUrl: result.thumbnail_url,
        } : undefined,
    };
};

const ChatPage: React.FC = () => {
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as { conversation_id?: string };
    const currentConversationId = searchParams.conversation_id;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [attachedFiles, setAttachedFiles] = useState<FileResponseDto[]>([]);
    const [attachedCollections, setAttachedCollections] = useState<CollectionAttachment[]>([]);
    const [selectedResult, setSelectedResult] = useState<SearchResult | undefined>();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [attachmentButtonRef, setAttachmentButtonRef] = useState<HTMLElement | null>(null);
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; searchResults?: SearchResult[]; attachedFiles?: FileResponseDto[] }>>([]);
    const [streamingMessage, setStreamingMessage] = useState<string>('');
    const [streamingResults, setStreamingResults] = useState<SearchResult[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

    const conversationsQuery = useConversations();
    const conversationQuery = useConversation(currentConversationId);

    // Filter to only show global conversations (no file_id or collection_id)
    const globalConversations = conversationsQuery.data?.filter(conv => !conv.file_id && !conv.collection_id) || [];

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    // Load conversation messages when selected or clear when new chat
    useEffect(() => {
        const loadMessagesWithFiles = async () => {
            if (conversationQuery.data?.messages) {
                const apiMessages = conversationQuery.data.messages;

                // Collect all unique fileIds from messages that have them
                const allFileIds = new Set<string>();
                apiMessages.forEach(msg => {
                    if (msg.fileIds && msg.fileIds.length > 0) {
                        msg.fileIds.forEach(id => allFileIds.add(id));
                    }
                });

                // Fetch file details if there are any fileIds
                let fileDetailsMap: Record<string, FileResponseDto> = {};
                if (allFileIds.size > 0) {
                    try {
                        const filesResponse = await uploadAPI.getFiles({
                            fileIds: Array.from(allFileIds).join(',')
                        });
                        if (filesResponse.files) {
                            filesResponse.files.forEach(file => {
                                fileDetailsMap[file.id] = file;
                            });
                        }
                    } catch (err) {
                        console.error('Failed to fetch file details for messages:', err);
                    }
                }

                // Map messages with attachedFiles from fileIds
                const messagesWithFiles = apiMessages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    searchResults: msg.searchResults,
                    attachedFiles: msg.fileIds?.map(id => fileDetailsMap[id]).filter(Boolean) || undefined
                }));

                setMessages(messagesWithFiles);
            } else if (!currentConversationId) {
                setMessages([]);
                setAttachedFiles([]);
                setError(null);
            }
        };

        loadMessagesWithFiles();
    }, [conversationQuery.data, currentConversationId]);

    const handleSendMessage = async (message: string) => {
        if (!message.trim() || isStreaming) return;

        setError(null);
        setIsStreaming(true);
        setStreamingMessage('');
        setStreamingResults([]);

        // Capture attached files and collections before clearing
        const currentAttachedFiles = [...attachedFiles];
        const currentAttachedCollections = [...attachedCollections];

        // Resolve collection file IDs
        let collectionFileIds: string[] = [];
        try {
            const fileIdPromises = currentAttachedCollections.map(c => collectionAPI.getCollectionFiles(c.id));
            const fileIdArrays = await Promise.all(fileIdPromises);
            collectionFileIds = [...new Set(fileIdArrays.flat())]; // Deduplicate
        } catch (err) {
            console.error('Failed to resolve collection files:', err);
        }

        // Combine file IDs from direct attachments and collections
        const allFileIds = [...new Set([...currentAttachedFiles.map(f => f.id), ...collectionFileIds])];

        // Add user message immediately with attached files
        const userMessage = {
            role: 'user' as const,
            content: message,
            attachedFiles: currentAttachedFiles.length > 0 ? currentAttachedFiles : undefined
        };
        setMessages(prev => [...prev, userMessage]);

        // Clear attachments after adding to message
        setAttachedFiles([]);
        setAttachedCollections([]);

        // Prepare payload
        const payload = {
            message,
            conversation_id: currentConversationId,
            file_ids: allFileIds.length > 0 ? allFileIds : undefined,
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

    const handleRemoveCollection = (collectionId: string) => {
        setAttachedCollections(collections => collections.filter(c => c.id !== collectionId));
    };

    const handleSelectFiles = (files: FileResponseDto[]) => {
        setAttachedFiles(files);
    };

    const handleSelectCollections = (collections: Collection[]) => {
        const collectionAttachments: CollectionAttachment[] = collections.map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            fileCount: c._count?.fileCollections || 0,
        }));
        setAttachedCollections(collectionAttachments);
    };

    const handleResultClick = (result: SearchResult) => {
        setSelectedResult(result);
        setIsLeftPanelCollapsed(true);
    };

    // Called when user clicks a timestamp badge inside the assistant message text.
    // Picks the best matching video result and opens it at that timestamp.
    const handleTimestampClick = (seconds: number, msgSearchResults?: SearchResult[]) => {
        // Prefer a result already on screen (from the message that holds the timestamp)
        const pool = msgSearchResults?.length ? msgSearchResults : streamingResults;
        // Find a result that covers this timestamp, or just the first video result
        const match =
            pool.find((r) => r.file_url && r.start_time !== undefined && r.start_time <= seconds && (r.end_time ?? Infinity) >= seconds) ??
            pool.find((r) => r.file_url || r.youtube_url) ??
            pool[0];

        if (match) {
            // Clone and override start_time so VideoPreview seeks to the right position
            setSelectedResult({ ...match, start_time: seconds });
            setIsLeftPanelCollapsed(true);
        }
    };

    const handleNewChat = () => {
        navigate({ to: '/chat', search: {}, replace: true });
    };

    const handleSelectConversation = (conversationId: string) => {
        setIsLeftPanelCollapsed(true);
        navigate({ to: '/chat', search: { conversation_id: conversationId } });
    };

    return (
        <div className="flex gap-6 h-full">
            {/* Left Panel - Conversations */}
            <div className={`flex flex-col transition-all duration-300 relative ${isLeftPanelCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-64 opacity-100'
                }`}>
                <ConversationList
                    conversations={globalConversations}
                    currentConversationId={currentConversationId}
                    onSelectConversation={handleSelectConversation}
                    onNewChat={handleNewChat}
                    isLoading={conversationsQuery.isLoading}
                />
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
                style={{ left: isLeftPanelCollapsed ? '0' : 'calc(16rem + 1.5rem)' }}
                title={isLeftPanelCollapsed ? 'Expand conversations' : 'Collapse conversations'}
            >
                {isLeftPanelCollapsed ? (
                    <ChevronRight size={18} className="text-white" />
                ) : (
                    <ChevronLeft size={18} className="text-white" />
                )}
            </button>

            {/* Right Panel - Chat */}
            <div className="flex-1 flex gap-6 min-h-0">
                {/* Chat Section */}
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
                                        onTimestampClick={handleTimestampClick}
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
                                                        <Markdown content={streamingMessage} searchResults={streamingResults} onTimestampClick={handleTimestampClick} />
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

                                {/* Attachments */}
                                {(attachedFiles.length > 0 || attachedCollections.length > 0) && (
                                    <div className="mx-4 mt-4">
                                        <Attachments
                                            files={attachedFiles}
                                            collections={attachedCollections}
                                            onRemoveFile={handleRemoveFile}
                                            onRemoveCollection={handleRemoveCollection}
                                        />
                                    </div>
                                )}

                                {/* Input */}
                                <div className="p-3 px-4">
                                    <ChatInput
                                        onSendMessage={handleSendMessage}
                                        onAttachFiles={(ref) => {
                                            setAttachmentButtonRef(ref);
                                            setShowAttachmentMenu(!showAttachmentMenu);
                                        }}
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

                                if (isYouTubeVideo) {
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

            {/* Attachment Menu Popover */}
            <Popover
                isOpen={showAttachmentMenu}
                onClose={() => setShowAttachmentMenu(false)}
                trigger={attachmentButtonRef}
                className="w-48 py-1"
            >
                <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left text-text-secondary hover:text-text-primary hover:bg-sidebar-hover"
                    onClick={() => {
                        setIsFilePickerOpen(true);
                        setShowAttachmentMenu(false);
                    }}
                >
                    <FilePlus size={16} />
                    <span>Attach Files</span>
                </button>
                <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left text-text-secondary hover:text-text-primary hover:bg-sidebar-hover"
                    onClick={() => {
                        setIsCollectionPickerOpen(true);
                        setShowAttachmentMenu(false);
                    }}
                >
                    <Folder size={16} />
                    <span>Attach Collections</span>
                </button>
            </Popover>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelectFiles={handleSelectFiles}
                selectedFileIds={attachedFiles.map(f => f.id)}
            />

            {/* Collection Picker Modal */}
            <CollectionPickerModal
                isOpen={isCollectionPickerOpen}
                onClose={() => setIsCollectionPickerOpen(false)}
                onSelectCollections={handleSelectCollections}
                selectedCollectionIds={attachedCollections.map(c => c.id)}
            />
        </div>
    );
};

export default ChatPage;

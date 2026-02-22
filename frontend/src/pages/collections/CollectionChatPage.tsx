import { type FC, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Folder, ArrowLeft, Calendar, File as FileIcon, FolderTree, AlertCircle, MessageSquare, Plus, Bot } from 'lucide-react';
import moment from 'moment';
import { useCollection } from '@/hooks/useCollection';
import { useConversations, useConversation } from '@/hooks/useChat';
import { chatAPI } from '@/api/chat';
import { collectionAPI } from '@/api/collection';
import { ChatSSEEvent, SearchResult } from '@/types/chat.types';
import Button from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import ConversationList from '@/pages/chat/components/ConversationList';
import MessageList from '@/pages/chat/components/MessageList';
import ChatInput from '@/pages/chat/components/ChatInput';
import Loader from '@/components/Loader';
import Markdown from '@/components/Markdown';

const CollectionChatPage: FC = () => {
    const { id: collectionId } = useParams({ strict: false }) as { id: string };
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamingMessageRef = useRef<string>('');

    const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; searchResults?: SearchResult[] }>>([]);
    const [streamingMessage, setStreamingMessage] = useState<string>('');
    const [streamingResults, setStreamingResults] = useState<SearchResult[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [collectionFileIds, setCollectionFileIds] = useState<string[]>([]);

    const collectionQuery = useCollection(collectionId);
    const conversationsQuery = useConversations();
    const conversationQuery = useConversation(selectedConversationId);

    const collection = collectionQuery.data?.collection;

    // Filter conversations for this collection
    const collectionConversations = conversationsQuery.data?.filter(conv => conv.collection_id === collectionId) || [];

    // Load collection file IDs
    useEffect(() => {
        const loadCollectionFiles = async () => {
            try {
                const fileIds = await collectionAPI.getCollectionFiles(collectionId);
                setCollectionFileIds(fileIds);
            } catch (err) {
                console.error('Failed to load collection files:', err);
            }
        };
        loadCollectionFiles();
    }, [collectionId]);

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
                searchResults: msg.results,
                timestamp: msg.timestamp,
            }));
            setMessages(formattedMessages);
        } else if (!selectedConversationId) {
            setMessages([]);
        }
    }, [conversationQuery.data, selectedConversationId]);

    const handleSendMessage = async (message: string) => {
        if (!message.trim() || isStreaming) return;

        const userMessage = { role: 'user' as const, content: message };
        setMessages(prev => [...prev, userMessage]);
        setIsStreaming(true);
        setError(null);
        setStreamingMessage('');
        setStreamingResults([]);
        streamingMessageRef.current = '';

        try {
            let newConversationId = selectedConversationId;
            await chatAPI.streamChat(
                {
                    message,
                    conversation_id: selectedConversationId,
                    file_ids: collectionFileIds,
                    collection_id: collectionId,
                    max_results: 5,
                },
                (event: ChatSSEEvent) => {
                    if (event.type === 'conversation_id' && event.conversation_id) {
                        newConversationId = event.conversation_id;
                        setSelectedConversationId(event.conversation_id);
                    } else if (event.type === 'content' && event.content) {
                        streamingMessageRef.current += event.content;
                        setStreamingMessage(prev => prev + event.content);
                    } else if (event.type === 'results' && event.results) {
                        setStreamingResults(event.results);
                    } else if (event.type === 'done') {
                        const finalContent = streamingMessageRef.current + (event.content || '');
                        const assistantMessage = {
                            role: 'assistant' as const,
                            content: finalContent,
                            searchResults: event.results || streamingResults,
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                        setStreamingMessage('');
                        setStreamingResults([]);
                        streamingMessageRef.current = '';
                        setIsStreaming(false);
                        conversationsQuery.refetch();
                    } else if (event.type === 'error') {
                        setError(event.error || 'An error occurred');
                        setIsStreaming(false);
                    }
                }
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
            setIsStreaming(false);
        }
    };

    const handleNewChat = () => {
        setSelectedConversationId(undefined);
        setMessages([]);
        setError(null);
    };

    if (collectionQuery.isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader size="lg" />
            </div>
        );
    }

    if (!collection) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-text-secondary">Collection not found</p>
                    <Button onClick={() => navigate({ to: '/collections' })} className="mt-4">
                        Go to Collections
                    </Button>
                </div>
            </div>
        );
    }

    const fileCount = collection._count?.fileCollections || 0;
    const folderCount = collection._count?.children || 0;

    return (
        <div className="flex gap-6 h-full">
            {/* Left Panel - Collection Details & Conversations */}
            <div className="w-80 flex flex-col gap-4">
                {/* Back Button */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate({ to: '/collections' })}
                    icon={<ArrowLeft size={16} />}
                    className="w-fit"
                >
                    Back to Collections
                </Button>

                {/* Collection Details Card */}
                <div className="rounded-xl border border-accent-primary/40 bg-bg-secondary/50 overflow-hidden">
                    {/* Collection Icon */}
                    <div className="p-4 bg-linear-to-br from-accent-primary/5 to-accent-secondary/5 border-b border-sidebar-border">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto"
                            style={{
                                backgroundColor: collection.color || 'var(--color-accent-primary)',
                                opacity: 0.9
                            }}
                        >
                            <Folder className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    {/* Collection Info */}
                    <div className="p-4 space-y-3">
                        <div>
                            <h3 className="text-sm font-semibold text-text-primary truncate" title={collection.name}>
                                {collection.name}
                            </h3>
                            {collection.description && (
                                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                                    {collection.description}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2 text-text-secondary">
                                <FileIcon size={12} className="shrink-0" />
                                <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 text-text-secondary">
                                <FolderTree size={12} className="shrink-0" />
                                <span>{folderCount} subcollection{folderCount !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 text-text-secondary">
                                <Calendar size={12} className="shrink-0" />
                                <span>{moment(collection.createdAt).format('MMM D, YYYY')}</span>
                            </div>
                        </div>

                        {collectionFileIds.length > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                {collectionFileIds.length} files ready
                            </div>
                        )}
                    </div>
                </div>

                {/* Conversations List */}
                <div className="flex-1 overflow-hidden">
                    <ConversationList
                        conversations={collectionConversations}
                        currentConversationId={selectedConversationId}
                        onSelectConversation={setSelectedConversationId}
                        onNewChat={handleNewChat}
                        isLoading={conversationsQuery.isLoading}
                    />
                </div>
            </div>

            {/* Right Panel - Chat Interface */}
            <div className="flex-1 flex flex-col">
                {/* Chat Header */}
                <div className="mb-6 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{
                                    backgroundColor: collection.color || 'var(--color-accent-primary)',
                                    opacity: 0.9
                                }}
                            >
                                <MessageSquare size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-text-primary">
                                    {selectedConversationId ? 'Conversation' : 'New Chat'}
                                </h1>
                                <p className="text-sm text-text-secondary">
                                    Ask questions about {collection.name}
                                </p>
                            </div>
                        </div>
                        {selectedConversationId && (
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
                        {collectionConversations.length} {collectionConversations.length === 1 ? 'conversation' : 'conversations'}
                    </p>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col min-h-0 relative">
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                        {messages.length === 0 && !streamingMessage ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                                    style={{
                                        backgroundColor: collection.color || 'var(--color-accent-primary)',
                                        opacity: 0.9
                                    }}
                                >
                                    <MessageSquare className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-lg font-semibold text-text-primary mb-2">
                                    Chat about this collection
                                </h3>
                                <p className="text-text-secondary text-sm">
                                    Ask questions about the {fileCount} file{fileCount !== 1 ? 's' : ''} in "{collection.name}"
                                </p>
                            </div>
                        ) : (
                            <>
                                <MessageList messages={messages} />
                                {streamingMessage && (
                                    <div className="flex gap-3 justify-start mt-4">
                                        <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                                            <Bot size={18} className="text-accent-primary" />
                                        </div>
                                        <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-bg-tertiary text-white border border-border">
                                            <div className="text-sm break-words">
                                                <Markdown content={streamingMessage} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Floating Input Widget */}
                    <div className="sticky bottom-0 max-w-4xl mx-auto pt-3 px-4">
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
                                    disabled={isStreaming || collectionFileIds.length === 0}
                                    hideAttachment
                                />
                                {collectionFileIds.length === 0 && (
                                    <p className="text-xs text-text-secondary mt-2">
                                        This collection has no files. Add files to start chatting.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectionChatPage;

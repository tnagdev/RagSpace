import { type FC, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearch } from '@tanstack/react-router';
import { FileVideo, FileImage, FileAudio, FileText, File, Youtube, ArrowLeft, Clock, AlertCircle, MessageSquare, Plus, Eye, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';
import { useFile } from '@/hooks/useUpload';
import { useConversations } from '@/hooks/useChat';
import { useChatSession } from '@/hooks/useChatSession';
import type { FileType, SearchHit } from '@/api/types';
import Button from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import ConversationList from '@/pages/chat/components/ConversationList';
import MessageList from '@/pages/chat/components/MessageList';
import ChatInput from '@/pages/chat/components/ChatInput';
import Loader from '@/components/Loader';
import StreamingReply from '@/pages/chat/components/StreamingReply';
import HitPreview, { hitAtTimestamp } from '@/pages/chat/components/HitPreview';

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

const FileChatPage: FC = () => {
    const { id: fileId } = useParams({ strict: false }) as { id: string };
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as { conversation_id?: string };
    const currentConversationId = searchParams.conversation_id;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [selectedResult, setSelectedResult] = useState<SearchHit | undefined>();
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

    const fileQuery = useFile(fileId);
    const conversationsQuery = useConversations({ fileId });
    const session = useChatSession({
        conversationId: currentConversationId,
        scope: { fileId },
        onConversationCreated: (id) =>
            navigate({ to: `/files/${fileId}/chat`, search: { conversation_id: id }, replace: true }),
    });
    const { turns, stream, error } = session;

    const file = fileQuery.data;
    const config = file ? fileTypeConfig[file.type] : null;
    const Icon = config?.icon;
    const fileConversations = (conversationsQuery.data?.pages ?? []).flatMap((page) => page.items);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns.length]);

    const handleSendMessage = (message: string) => session.send(message);

    const handleNewChat = () => {
        session.setError(null);
        navigate({ to: `/files/${fileId}/chat`, search: {}, replace: true });
    };

    const handleSelectConversation = (conversationId: string) => {
        setIsLeftPanelCollapsed(true);
        navigate({ to: `/files/${fileId}/chat`, search: { conversation_id: conversationId } });
    };

    const handleResultClick = (result: SearchHit) => {
        setSelectedResult(result);
        setIsLeftPanelCollapsed(true);
    };

    const handleTimestampClick = (seconds: number, hits?: SearchHit[]) => {
        const match = hitAtTimestamp(hits?.length ? hits : stream.hits, seconds);
        if (match) handleResultClick(match);
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
                                        alt={file.name}
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
                                <h3 className="text-sm font-semibold text-text-primary truncate mb-1.5" title={file.name}>
                                    {file.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                                    <span className="px-2 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary font-medium">
                                        {file.type.replace('_', ' ')}
                                    </span>
                                    <span>{(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-text-secondary mt-1.5">
                                    <Clock size={11} className="shrink-0 opacity-60" />
                                    <span>{moment(file.uploadedAt ?? file.createdAt).fromNow()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            {file.downloadUrl && (
                                <button
                                    onClick={() => window.open(file.downloadUrl!, '_blank')}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary hover:bg-accent-primary/10 border border-border hover:border-accent-primary/50 text-text-secondary hover:text-accent-primary transition-all text-xs font-medium"
                                >
                                    <Eye size={14} />
                                    View
                                </button>
                            )}
                            {file.downloadUrl && (
                                <button
                                    onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = file.downloadUrl!;
                                        a.download = file.name;
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
                                Ask questions about {file.name}
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
                        {turns.length === 0 && !stream.active ? (
                            <div className="h-full flex flex-col items-center justify-center text-text-secondary">
                                <MessageSquare size={48} className="mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold text-text-primary mb-2">
                                    Chat about this file
                                </h3>
                                <p className="text-text-secondary text-sm">
                                    Ask questions, get insights, or search through the content of {file.name}
                                </p>
                            </div>
                        ) : (
                            <>
                                {turns.length > 0 && (
                                    <MessageList messages={turns} onResultClick={handleResultClick} onTimestampClick={handleTimestampClick} />
                                )}
                                {stream.active && (
                                    <StreamingReply stream={stream} onResultClick={handleResultClick} onTimestampClick={handleTimestampClick} />
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
                                    isLoading={stream.active}
                                    disabled={stream.active || file.processingStatus !== 'COMPLETED'}
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
                                    {selectedResult.startSeconds !== null
                                        ? `Scene at ${Math.floor(selectedResult.startSeconds)}s`
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
                            <HitPreview hit={selectedResult} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileChatPage;

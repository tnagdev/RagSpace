import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ApiFile, Collection, SearchHit } from '@/api/types';
import type { CollectionAttachment } from '@/types/attachments';
import { collectionsAPI } from '@/api/collections';
import { useConversations } from '@/hooks/useChat';
import { useChatSession } from '@/hooks/useChatSession';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import ConversationList from './components/ConversationList';
import StreamingReply from './components/StreamingReply';
import HitPreview, { hitAtTimestamp } from './components/HitPreview';
import Attachments from '@/components/Attachments';
import Popover from '@/components/Popover';
import FilePickerModal from '../search/components/FilePickerModal';
import CollectionPickerModal from '../search/components/CollectionPickerModal';
import { IconButton } from '@/components/IconButton';
import { AlertCircle, ChevronLeft, ChevronRight, FilePlus, Folder, MessageSquare, X } from 'lucide-react';

const MAX_MESSAGE_FILES = 100;

const ChatPage: React.FC = () => {
    const navigate = useNavigate();
    const searchParams = useSearch({ strict: false }) as { conversation_id?: string };
    const currentConversationId = searchParams.conversation_id;
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [attachedFiles, setAttachedFiles] = useState<ApiFile[]>([]);
    const [attachedCollections, setAttachedCollections] = useState<CollectionAttachment[]>([]);
    const [selectedResult, setSelectedResult] = useState<SearchHit | undefined>();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [attachmentButtonRef, setAttachmentButtonRef] = useState<HTMLElement | null>(null);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

    const conversationsQuery = useConversations();
    const session = useChatSession({
        conversationId: currentConversationId,
        onConversationCreated: (id) => navigate({ to: '/chat', search: { conversation_id: id }, replace: true }),
    });
    const { turns, stream, error } = session;

    // The library-wide chat lists only conversations not scoped to a file or collection.
    const globalConversations = (conversationsQuery.data?.pages ?? [])
        .flatMap((page) => page.items)
        .filter((conv) => !conv.fileId && !conv.collectionId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns.length]);

    const handleSendMessage = async (message: string) => {
        const files = attachedFiles;
        const collections = attachedCollections;
        setAttachedFiles([]);
        setAttachedCollections([]);

        // A single collection on a new chat scopes the whole conversation; the server resolves its tree.
        if (!currentConversationId && collections.length === 1 && files.length === 0) {
            await session.send(message, { scope: { collectionId: collections[0].id } });
            return;
        }
        const collectionFileIds = (await Promise.all(collections.map((c) => collectionsAPI.fileIds(c.id)))).flat();
        const fileIds = [...new Set([...files.map((f) => f.id), ...collectionFileIds])].slice(0, MAX_MESSAGE_FILES);
        await session.send(message, { fileIds, attachedFiles: files });
    };

    const handleRemoveFile = (fileId: string) => {
        setAttachedFiles((current) => current.filter((f) => f.id !== fileId));
    };

    const handleRemoveCollection = (collectionId: string) => {
        setAttachedCollections((current) => current.filter((c) => c.id !== collectionId));
    };

    const handleSelectCollections = (collections: Collection[]) => {
        setAttachedCollections(
            collections.map((c) => ({ id: c.id, name: c.name, color: c.color, fileCount: c.fileCount })),
        );
    };

    const handleResultClick = (result: SearchHit) => {
        setSelectedResult(result);
        setIsLeftPanelCollapsed(true);
    };

    const handleTimestampClick = (seconds: number, hits?: SearchHit[]) => {
        const match = hitAtTimestamp(hits?.length ? hits : stream.hits, seconds);
        if (match) handleResultClick(match);
    };

    const handleImageClick = (fileId: string, hits?: SearchHit[]) => {
        const match = (hits?.length ? hits : stream.hits).find((h) => h.fileId === fileId);
        if (match) handleResultClick(match);
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
                            {turns.length === 0 && !stream.active ? (
                                <div className="h-full flex flex-col items-center justify-center text-text-secondary">
                                    <MessageSquare size={48} className="mb-4 opacity-50" />
                                    <p>Start a conversation or select one from the sidebar</p>
                                </div>
                            ) : (
                                <>
                                    {turns.length > 0 && (
                                        <MessageList
                                            messages={turns}
                                            onResultClick={handleResultClick}
                                            onTimestampClick={handleTimestampClick}
                                            onImageClick={handleImageClick}
                                        />
                                    )}
                                    {stream.active && (
                                        <StreamingReply
                                            stream={stream}
                                            onResultClick={handleResultClick}
                                            onTimestampClick={handleTimestampClick}
                                            onImageClick={handleImageClick}
                                        />
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
                                        isLoading={stream.active}
                                        disabled={stream.active}
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
                onSelectFiles={setAttachedFiles}
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

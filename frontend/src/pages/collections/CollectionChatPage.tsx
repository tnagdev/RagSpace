import { type FC, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Folder, ArrowLeft, Calendar, File as FileIcon, FolderTree, AlertCircle, MessageSquare, Plus } from 'lucide-react';
import moment from 'moment';
import { useCollection } from '@/hooks/useCollection';
import { useConversations } from '@/hooks/useChat';
import { useChatSession } from '@/hooks/useChatSession';
import { collectionColor } from '@/lib/collectionColors';
import Button from '@/components/Button';
import ConversationList from '@/pages/chat/components/ConversationList';
import MessageList from '@/pages/chat/components/MessageList';
import ChatInput from '@/pages/chat/components/ChatInput';
import Loader from '@/components/Loader';
import StreamingReply from '@/pages/chat/components/StreamingReply';

const CollectionChatPage: FC = () => {
    const { id: collectionId } = useParams({ strict: false }) as { id: string };
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();

    const collectionQuery = useCollection(collectionId);
    const conversationsQuery = useConversations({ collectionId });
    const session = useChatSession({
        conversationId: selectedConversationId,
        scope: { collectionId },
        onConversationCreated: setSelectedConversationId,
    });
    const { turns, stream, error } = session;

    const collection = collectionQuery.data;
    const collectionConversations = (conversationsQuery.data?.pages ?? []).flatMap((page) => page.items);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns.length, stream.text]);

    const handleSendMessage = (message: string) => session.send(message);

    const handleNewChat = () => {
        setSelectedConversationId(undefined);
        session.setError(null);
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

    const fileCount = collection.fileCount;
    const folderCount = collection.childCount;

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
                                backgroundColor: collectionColor(collection.color),
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

                        {fileCount > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                {fileCount} files ready
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
                                    backgroundColor: collectionColor(collection.color),
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
                        {turns.length === 0 && !stream.active ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                                    style={{
                                        backgroundColor: collectionColor(collection.color),
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
                                <MessageList messages={turns} />
                                {stream.active && <StreamingReply stream={stream} />}
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
                                    isLoading={stream.active}
                                    disabled={stream.active || fileCount + folderCount === 0}
                                    hideAttachment
                                />
                                {fileCount + folderCount === 0 && (
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

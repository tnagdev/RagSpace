import { ConversationSummary } from '@/types/chat.types';
import Button from '@/components/Button';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useDeleteConversation } from '@/hooks/useChat';

interface ConversationListProps {
    conversations: ConversationSummary[];
    currentConversationId?: string;
    onSelectConversation: (id: string) => void;
    onNewChat: () => void;
    isLoading?: boolean;
}

const formatRelativeTime = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
};

const ConversationList: React.FC<ConversationListProps> = ({
    conversations,
    currentConversationId,
    onSelectConversation,
    onNewChat,
    isLoading,
}) => {
    const deleteMutation = useDeleteConversation();

    const handleDelete = (e: React.MouseEvent, conversationId: string) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
            deleteMutation.mutate(conversationId);
        }
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-accent-secondary uppercase tracking-wider">
                    Conversations
                </h3>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onNewChat}
                    disabled={isLoading}
                    className="text-xs py-1 px-2"
                >
                    <Plus size={12} className="mr-1" />
                    New
                </Button>
            </div>

            {isLoading ? (
                <div className="text-xs text-text-secondary text-center py-4">
                    Loading...
                </div>
            ) : conversations.length === 0 ? (
                <div className="text-xs text-text-secondary text-center py-4">
                    No conversations yet
                </div>
            ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto custom-scrollbar">
                    {conversations.map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => onSelectConversation(conv.id)}
                            className={`w-full text-left px-2 py-2 rounded-lg transition-all duration-200
                                       flex items-start gap-2 group
                                       ${currentConversationId === conv.id
                                    ? 'bg-sidebar-hover border border-accent-primary/30'
                                    : 'hover:bg-sidebar-hover/50 border border-transparent'
                                }`}
                        >
                            <MessageSquare
                                size={14}
                                className={`shrink-0 mt-0.5 ${currentConversationId === conv.id
                                    ? 'text-accent-primary'
                                    : 'text-text-secondary'
                                    }`}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-white truncate">
                                    {conv.title || 'Untitled Chat'}
                                </div>
                                <div className="text-xs text-text-secondary truncate line-clamp-1">
                                    {conv.last_message}
                                </div>
                                <div className="text-xs text-text-secondary/60 mt-0.5">
                                    {formatRelativeTime(conv.updated_at)}
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, conv.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 
                                         hover:bg-danger/20 rounded text-danger"
                                title="Delete conversation"
                            >
                                <Trash2 size={12} />
                            </button>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ConversationList;

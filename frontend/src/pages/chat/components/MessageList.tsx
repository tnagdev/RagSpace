import { SearchResult } from '@/types/chat.types';
import { FileResponseDto } from '@/types/upload.types';
import { User, Bot, Image as ImageIcon, Paperclip, Film } from 'lucide-react';
import Markdown from '@/components/Markdown';

interface MessageListProps {
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string; searchResults?: SearchResult[]; attachedFiles?: FileResponseDto[] }>;
    onResultClick?: (result: SearchResult) => void;
    onTimestampClick?: (seconds: number, searchResults?: SearchResult[]) => void;
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

const MessageList: React.FC<MessageListProps> = ({
    messages,
    onResultClick,
    onTimestampClick,
}) => {
    return (
        <div className="space-y-4">
            {messages.map((message, index) => (
                <div
                    key={index}
                    className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    {message.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                            <Bot size={18} className="text-accent-primary" />
                        </div>
                    )}

                    <div
                        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${message.role === 'user'
                            ? 'bg-accent-primary text-white'
                            : 'bg-bg-tertiary text-white border border-border'
                            }`}
                    >
                        {/* Show attached files for user messages */}
                        {message.role === 'user' && message.attachedFiles && message.attachedFiles.length > 0 && (
                            <div className="mb-2 pb-2 border-b border-white/20">
                                <div className="flex items-center gap-1 text-xs opacity-80 mb-2">
                                    <Paperclip size={12} />
                                    <span>Searching in {message.attachedFiles.length} file{message.attachedFiles.length > 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {message.attachedFiles.map((file) => (
                                        <div
                                            key={file.id}
                                            className="flex items-center gap-2 bg-white/10 rounded px-2 py-1"
                                        >
                                            {file.thumbnailUrl ? (
                                                <img
                                                    src={file.thumbnailUrl}
                                                    alt={file.originalFilename}
                                                    className="w-8 h-8 object-cover rounded"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center">
                                                    {file.fileType === 'VIDEO' ? (
                                                        <Film size={14} className="opacity-70" />
                                                    ) : (
                                                        <ImageIcon size={14} className="opacity-70" />
                                                    )}
                                                </div>
                                            )}
                                            <span className="text-xs truncate max-w-25">{file.originalFilename}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="text-sm break-words">
                            {message.role === 'assistant' ? (
                                <Markdown
                                    content={message.content}
                                    searchResults={message.searchResults}
                                    onTimestampClick={onTimestampClick
                                        ? (s) => onTimestampClick(s, message.searchResults)
                                        : undefined}
                                />
                            ) : (
                                <span className="whitespace-pre-wrap">{message.content}</span>
                            )}
                        </div>

                        {message.timestamp && (
                            <div className="text-xs opacity-60 mt-1">
                                {formatRelativeTime(message.timestamp)}
                            </div>
                        )}

                        {/* Show search results for assistant messages */}
                        {message.role === 'assistant' && message.searchResults && message.searchResults.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                                <div className="text-xs font-semibold text-text-secondary mb-3">
                                    Related Results ({message.searchResults.length})
                                </div>
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                    <div className="grid grid-cols-4 gap-2">
                                        {message.searchResults.map((result, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => onResultClick?.(result)}
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
                                                            <ImageIcon size={16} className="text-text-secondary" />
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

                    {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0">
                            <User size={18} className="text-text-secondary" />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default MessageList;

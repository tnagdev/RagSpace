import { useEffect, useRef, useState } from 'react';
import { Film, MessageSquare } from 'lucide-react';
import Markdown from '@/components/Markdown';
import type { SearchHit } from '@/api/types';
import type { StreamState } from '@/hooks/useChatSession';

function useTypewriter(text: string): string {
    const [shown, setShown] = useState('');
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        setShown('');
        let i = 0;
        timer.current = setInterval(() => {
            i++;
            setShown(text.slice(0, i));
            if (i >= text.length && timer.current) clearInterval(timer.current);
        }, 25);
        return () => {
            if (timer.current) clearInterval(timer.current);
        };
    }, [text]);
    return shown;
}

interface StreamingReplyProps {
    stream: StreamState;
    onResultClick?: (hit: SearchHit) => void;
    onTimestampClick?: (seconds: number, hits?: SearchHit[]) => void;
    onImageClick?: (fileId: string, hits?: SearchHit[]) => void;
}

const StreamingReply: React.FC<StreamingReplyProps> = ({ stream, onResultClick, onTimestampClick, onImageClick }) => {
    const label = useTypewriter(stream.label);
    return (
        <div className="flex gap-3 justify-start mb-4">
            <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
                <MessageSquare size={18} className="text-accent-primary" />
            </div>
            <div className="max-w-[80%] rounded-lg px-4 py-2.5 bg-bg-tertiary text-white border border-border">
                {stream.text ? (
                    <div className="text-sm break-words">
                        <Markdown
                            content={stream.text}
                            hits={stream.hits}
                            onTimestampClick={onTimestampClick ? (s) => onTimestampClick(s, stream.hits) : undefined}
                            onImageClick={onImageClick ? (id) => onImageClick(id, stream.hits) : undefined}
                        />
                        <span className="inline-block w-1 h-4 bg-accent-primary ml-1 animate-pulse" />
                    </div>
                ) : (
                    <div className="text-sm text-text-secondary flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-accent-primary rounded-full animate-pulse" />
                        {label}
                        <span className="inline-block w-0.5 h-3.5 bg-text-secondary/60 animate-pulse" />
                    </div>
                )}

                {stream.hits.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-xs font-semibold text-text-secondary mb-3">Found Results ({stream.hits.length})</div>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            <div className="grid grid-cols-4 gap-2">
                                {stream.hits.map((hit, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onResultClick?.(hit)}
                                        className="text-left p-2 rounded bg-bg-secondary hover:bg-bg-tertiary border border-border/50 hover:border-accent-primary/50 transition-all duration-200 group max-w-full"
                                    >
                                        <div className="flex items-start gap-2">
                                            {hit.thumbnailUrl ? (
                                                <img src={hit.thumbnailUrl} alt={hit.fileName} className="w-12 h-12 object-cover rounded shrink-0" />
                                            ) : (
                                                <div className="w-12 h-12 bg-bg-tertiary rounded flex items-center justify-center shrink-0">
                                                    <Film size={16} className="text-text-secondary" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-white truncate group-hover:text-accent-primary transition-colors">
                                                    {hit.fileName}
                                                </div>
                                                {hit.startSeconds !== null && (
                                                    <div className="text-xs text-text-secondary">{Math.floor(hit.startSeconds)}s</div>
                                                )}
                                                <div className="text-xs text-text-secondary/70">{(hit.score * 100).toFixed(1)}%</div>
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
    );
};

export default StreamingReply;

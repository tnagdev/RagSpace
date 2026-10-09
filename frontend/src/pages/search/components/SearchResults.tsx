import { Accordion } from '@/components/Accordion';
import type { SearchHit } from '@/api/types';
import { Clock, Film, Image as ImageIcon, Star, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResultsProps {
    results: SearchHit[];
    onSceneClick: (result: SearchHit) => void;
    selectedResult?: SearchHit;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, onSceneClick, selectedResult }) => {
    // Group results by file
    const groupedResults = results.reduce((acc, result) => {
        const fileId = result.fileId;
        if (!acc[fileId]) {
            acc[fileId] = [];
        }
        acc[fileId].push(result);
        return acc;
    }, {} as Record<string, SearchHit[]>);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-[var(--color-success)]';
        if (score >= 0.6) return 'text-[var(--color-accent-primary)]';
        return 'text-[var(--color-text-muted)]';
    };

    if (results.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <Film size={48} className="text-text-muted mb-4" />
                <p className="text-text-primary font-medium mb-2">
                    No results found
                </p>
                <p className="text-sm text-text-muted">
                    Try a different search query or adjust your filters
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="text-sm text-text-muted">
                Found {results.length} result{results.length !== 1 ? 's' : ''}
            </div>

            {Object.entries(groupedResults).map(([fileId, fileResults]) => {
                const firstResult = fileResults[0];
                                const isVideo = firstResult.fileType === 'VIDEO' || firstResult.fileType === 'YOUTUBE_VIDEO';
                const isImage = firstResult.fileType === 'IMAGE';

                // For videos with multiple scenes, use accordion
                if (isVideo && fileResults.length > 1) {
                    return (
                        <div key={fileId}>
                            <Accordion
                                itemClassName="rounded-xl border border-[var(--color-border-input)] hover:border-[var(--color-accent-primary)] bg-[var(--color-bg-secondary)] transition-colors"
                                headerClassName="p-4"
                                contentClassName="border-t-0"
                                items={[
                                    {
                                        id: fileId,
                                        title: (
                                            <div className="flex items-start gap-4 py-1">
                                                {(firstResult.thumbnailUrl) && (
                                                    <img
                                                        src={firstResult.thumbnailUrl}
                                                        alt={firstResult.sceneNumber ? `Scene ${firstResult.sceneNumber}` : firstResult.fileName}
                                                        className="w-32 h-24 object-cover rounded"
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Film size={20} className="text-accent-primary" />
                                                        <span className="font-medium text-text-primary truncate flex-1">
                                                            {firstResult.fileName || 'Unknown File'}
                                                        </span>
                                                        <span className={cn("ml-auto flex items-center gap-1 text-sm font-medium shrink-0", getScoreColor(firstResult.score))}>
                                                            <Star size={14} fill="currentColor" />
                                                            {(firstResult.score * 100).toFixed(0)}%
                                                        </span>
                                                    </div>

                                                    {/* Metadata */}
                                                    <div className="flex items-center gap-3 text-xs text-text-muted mb-2">
                                                        <span className="flex items-center gap-1">
                                                            <Video size={12} />
                                                            Video
                                                        </span>
                                                        <span>{fileResults.length} scene{fileResults.length !== 1 ? 's' : ''}</span>
                                                    </div>

                                                    {firstResult.snippet && (
                                                        <p className="text-sm text-text-secondary line-clamp-2">
                                                            {firstResult.snippet}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ),
                                        children: (
                                            <div className="space-y-2 pb-4 px-4">
                                                {fileResults.map((result, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => onSceneClick(result)}
                                                        className={cn(
                                                            "w-full text-left p-3 rounded-lg transition-colors",
                                                            "hover:bg-bg-hover",
                                                            selectedResult === result && "bg-accent-primary/10 border border-accent-primary"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            {(result.thumbnailUrl) && (
                                                                <img
                                                                    src={result.thumbnailUrl}
                                                                    alt={result.sceneNumber ? `Scene ${result.sceneNumber}` : result.fileName}
                                                                    className="w-24 h-16 object-cover rounded"
                                                                />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-sm font-medium text-text-primary">
                                                                        Scene {result.sceneNumber ?? idx + 1}
                                                                    </span>
                                                                    <span className={cn("flex items-center gap-1 text-xs font-medium", getScoreColor(result.score))}>
                                                                        <Star size={12} fill="currentColor" />
                                                                        {(result.score * 100).toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                                {result.startSeconds !== null && result.endSeconds !== null && (
                                                                    <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                                                                        <Clock size={12} />
                                                                        <span>
                                                                            {formatTime(result.startSeconds)} - {formatTime(result.endSeconds)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {result.snippet && (
                                                                    <p className="text-sm text-text-secondary line-clamp-2">
                                                                        {result.snippet}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ),
                                        defaultOpen: false,
                                    },
                                ]}
                                allowMultiple={false}
                            />
                        </div>
                    );
                }

                // For single results or images, show directly
                return (
                    <button
                        key={fileId}
                        onClick={() => onSceneClick(firstResult)}
                        className={cn(
                            "w-full text-left p-4 rounded-xl transition-all",
                            "border border-border-input bg-bg-secondary",
                            "hover:border-accent-primary hover:shadow-lg",
                            selectedResult === firstResult && "border-accent-primary shadow-lg"
                        )}
                    >
                        <div className="flex items-start gap-4">
                            {isImage && (firstResult.thumbnailUrl || firstResult.fileUrl) && (
                                <img
                                    src={firstResult.thumbnailUrl ?? firstResult.fileUrl ?? undefined}
                                    alt={firstResult.fileName}
                                    className="w-32 h-24 object-cover rounded"
                                />
                            )}
                            {isVideo && (firstResult.thumbnailUrl) && (
                                <img
                                    src={firstResult.thumbnailUrl}
                                    alt={firstResult.sceneNumber ? `Scene ${firstResult.sceneNumber}` : firstResult.fileName}
                                    className="w-32 h-24 object-cover rounded"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    {isImage ? (
                                        <ImageIcon size={20} className="text-accent-primary" />
                                    ) : (
                                        <Film size={20} className="text-accent-primary" />
                                    )}
                                    <span className="font-medium text-text-primary truncate flex-1">
                                        {firstResult.fileName || 'Unknown File'}
                                    </span>
                                    <span className={cn("ml-auto flex items-center gap-1 text-sm font-medium shrink-0", getScoreColor(firstResult.score))}>
                                        <Star size={14} fill="currentColor" />
                                        {(firstResult.score * 100).toFixed(0)}%
                                    </span>
                                </div>

                                {/* Metadata */}
                                <div className="flex items-center gap-3 text-xs text-text-muted mb-2">
                                    <span className="flex items-center gap-1">
                                        {isImage ? <ImageIcon size={12} /> : <Video size={12} />}
                                        {isImage ? 'Image' : 'Video'}
                                    </span>
                                </div>

                                {firstResult.snippet && (
                                    <p className="text-sm text-text-secondary line-clamp-2">
                                        {firstResult.snippet}
                                    </p>
                                )}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default SearchResults;

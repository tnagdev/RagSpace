import { FileText, Sparkles } from 'lucide-react';
import type { SearchHit } from '@/api/types';

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const HitDetails: React.FC<{ hit: SearchHit; snippetLabel: string }> = ({ hit, snippetLabel }) => (
    <>
        {hit.sceneNumber !== null && hit.startSeconds !== null && hit.endSeconds !== null && (
            <div className="mb-4 p-4 rounded-lg bg-bg-tertiary border border-border-input">
                <h3 className="text-sm font-semibold text-text-primary mb-1">Scene {hit.sceneNumber}</h3>
                <div className="text-sm text-text-secondary">
                    {formatTime(hit.startSeconds)} – {formatTime(hit.endSeconds)}
                </div>
            </div>
        )}

        {hit.visual?.summary && (
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <Sparkles size={16} className="text-accent-primary" />
                    What's shown
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">{hit.visual.summary}</p>
                {hit.visual.objects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {hit.visual.objects.map((object) => (
                            <span key={object} className="text-xs px-2 py-0.5 rounded-md bg-bg-tertiary text-text-secondary">
                                {object}
                            </span>
                        ))}
                    </div>
                )}
                {hit.visual.setting && <p className="text-xs text-text-muted mt-2">Setting: {hit.visual.setting}</p>}
            </div>
        )}

        {hit.snippet && (
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-accent-primary" />
                    {snippetLabel}
                </h3>
                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-input">
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{hit.snippet}</p>
                </div>
            </div>
        )}

        <div className="p-4 rounded-lg bg-bg-tertiary border border-border-input flex justify-between items-center">
            <span className="text-sm text-text-muted">Relevance</span>
            <span className="text-sm font-semibold text-accent-primary">{(hit.score * 100).toFixed(1)}%</span>
        </div>
    </>
);

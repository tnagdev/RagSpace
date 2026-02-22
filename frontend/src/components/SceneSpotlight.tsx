import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useFiles } from '@/hooks/useUpload';
import { FileType, ProcessingStage } from '@/types/upload.types';
import type { FileResponseDto } from '@/types/upload.types';
import {
    FileVideo, FileImage, FileAudio, FileText, Youtube, File,
    ChevronLeft, ChevronRight, MessageSquare, Clapperboard,
} from 'lucide-react';

const TYPE_ICON: Record<FileType, typeof FileVideo> = {
    VIDEO: FileVideo,
    YOUTUBE_VIDEO: Youtube,
    IMAGE: FileImage,
    AUDIO: FileAudio,
    DOCUMENT: FileText,
    OTHER: File,
};

const AUTO_ADVANCE_MS = 6000;

function FileThumb({ file }: { file: FileResponseDto }) {
    const Icon = TYPE_ICON[file.fileType] ?? File;
    if (file.thumbnailUrl) {
        return <img src={file.thumbnailUrl} alt={file.originalFilename} className="w-full h-full object-cover" />;
    }
    return (
        <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'var(--color-bg-tertiary)' }}
        >
            <Icon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        </div>
    );
}

export function SceneSpotlight() {
    const navigate = useNavigate();
    const { data } = useFiles({ limit: 50 });

    const files = (data?.files ?? []).filter(
        (f) => f.processingStage === ProcessingStage.COMPLETED,
    );

    const [idx, setIdx] = useState(0);
    const [fading, setFading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const shuffledRef = useRef<FileResponseDto[]>([]);
    useEffect(() => {
        if (files.length > 0 && shuffledRef.current.length === 0) {
            shuffledRef.current = [...files].sort(() => Math.random() - 0.5);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [files.length]);

    const pool = shuffledRef.current.length > 0 ? shuffledRef.current : files;
    const current = pool[idx % pool.length];

    const goTo = (next: number) => {
        if (fading) return;
        setFading(true);
        setTimeout(() => {
            setIdx(((next % pool.length) + pool.length) % pool.length);
            setFading(false);
        }, 180);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => goTo(next + 1), AUTO_ADVANCE_MS);
    };

    useEffect(() => {
        if (pool.length <= 1) return;
        timerRef.current = setTimeout(() => goTo(idx + 1), AUTO_ADVANCE_MS);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, pool.length]);

    if (!current) {
        return (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <Clapperboard className="w-3.5 h-3.5 shrink-0" />
                <span>No indexed files yet</span>
            </div>
        );
    }

    const label = current.originalFilename.replace(/\.[^.]+$/, '');
    const dotCount = Math.min(pool.length, 7);
    const dotIdx = idx % dotCount;

    return (
        <div className="flex items-center gap-2 select-none" style={{ maxWidth: 340 }}>

            {/* Thumbnail */}
            <div
                className="shrink-0 rounded overflow-hidden transition-opacity duration-150"
                style={{
                    width: 44,
                    height: 30,
                    opacity: fading ? 0 : 1,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-tertiary)',
                }}
            >
                <FileThumb file={current} />
            </div>

            {/* Label + dots */}
            <div
                className="flex flex-col gap-1 min-w-0 flex-1 transition-opacity duration-150"
                style={{ opacity: fading ? 0 : 1 }}
            >
                <span
                    className="text-xs font-medium leading-none truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                    title={label}
                >
                    {label}
                </span>
                {pool.length > 1 && (
                    <div className="flex items-center gap-0.5">
                        {Array.from({ length: dotCount }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className="rounded-full transition-all duration-200"
                                style={{
                                    width: i === dotIdx ? 12 : 4,
                                    height: 3,
                                    background: i === dotIdx
                                        ? 'var(--color-accent-primary)'
                                        : 'var(--color-text-muted)',
                                    opacity: i === dotIdx ? 1 : 0.3,
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Prev / Next */}
            {pool.length > 1 && (
                <div className="flex items-center shrink-0">
                    {[{ dir: -1, C: ChevronLeft }, { dir: 1, C: ChevronRight }].map(({ dir, C }) => (
                        <button
                            key={dir}
                            onClick={() => goTo(idx + dir)}
                            className="p-0.5 rounded transition-colors duration-100"
                            style={{ color: 'var(--color-text-muted)' }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
                            }}
                        >
                            <C className="w-3 h-3" />
                        </button>
                    ))}
                </div>
            )}

            {/* Chat CTA */}
            <button
                onClick={() => navigate({ to: '/files/$id/chat', params: { id: current.id } })}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors duration-150"
                style={{
                    background: 'color-mix(in srgb, var(--color-accent-primary) 15%, transparent)',
                    color: 'var(--color-accent-primary)',
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                        'color-mix(in srgb, var(--color-accent-primary) 25%, transparent)';
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                        'color-mix(in srgb, var(--color-accent-primary) 15%, transparent)';
                }}
            >
                <MessageSquare className="w-3 h-3" />
                Chat
            </button>
        </div>
    );
}

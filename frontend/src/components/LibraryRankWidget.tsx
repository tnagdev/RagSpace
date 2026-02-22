import { useState } from 'react';
import { useFiles, useStorageStats } from '@/hooks/useUpload';
import { useConversations } from '@/hooks/useChat';
import { ProcessingStage } from '@/types/upload.types';
import {
    Archive, BookOpen, Search, Library, Layers, Database, Zap,
    MessageSquare, FileCheck2, ChevronRight,
} from 'lucide-react';

// ─── Rank definitions ────────────────────────────────────────────────────────

interface Rank {
    name: string;
    minFiles: number;        // indexed files needed to reach this rank
    nextAt: number | null;   // indexed files needed for NEXT rank (null = max)
    icon: typeof Zap;
    color: string;           // CSS color / var
    barColor: string;        // gradient for XP bar
    level: number;
}

const RANKS: Rank[] = [
    {
        level: 0, name: 'Empty Vault', minFiles: 0, nextAt: 1,
        icon: Archive, color: 'var(--color-text-muted)',
        barColor: 'var(--color-text-muted)',
    },
    {
        level: 1, name: 'Rookie Archivist', minFiles: 1, nextAt: 5,
        icon: BookOpen, color: '#60a5fa',
        barColor: '#60a5fa',
    },
    {
        level: 2, name: 'Scene Hunter', minFiles: 5, nextAt: 15,
        icon: Search, color: '#34d399',
        barColor: '#34d399',
    },
    {
        level: 3, name: 'Visual Librarian', minFiles: 15, nextAt: 30,
        icon: Library, color: '#a78bfa',
        barColor: '#a78bfa',
    },
    {
        level: 4, name: 'Media Curator', minFiles: 30, nextAt: 60,
        icon: Layers, color: 'var(--color-accent-primary)',
        barColor: 'var(--color-accent-primary)',
    },
    {
        level: 5, name: 'Index Master', minFiles: 60, nextAt: 100,
        icon: Database, color: '#fbbf24',
        barColor: '#fbbf24',
    },
    {
        level: 6, name: 'RagSpace Legend', minFiles: 100, nextAt: null,
        icon: Zap, color: '#f87171',
        barColor: '#f87171',
    },
];

function getRank(indexed: number): Rank {
    let current = RANKS[0];
    for (const r of RANKS) {
        if (indexed >= r.minFiles) current = r;
        else break;
    }
    return current;
}

function getXP(indexed: number, conversations: number) {
    return indexed * 100 + conversations * 25;
}

function formatXP(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LibraryRankWidget() {
    const [showTooltip, setShowTooltip] = useState(false);

    // Completed / indexed files
    const { data: indexedData } = useFiles({
        limit: 1,
        processingStage: ProcessingStage.COMPLETED,
    });
    // All files for total count
    const { data: allData } = useStorageStats();
    // Conversations
    const { data: convData } = useConversations();

    const indexedCount = indexedData?.total ?? 0;
    const totalFiles = allData?.fileCount ?? 0;
    const chatCount = Array.isArray(convData) ? convData.length : 0;

    const rank = getRank(indexedCount);
    const xp = getXP(indexedCount, chatCount);
    const Icon = rank.icon;

    // XP bar within current rank
    let barPct = 100;
    let xpLabel = 'MAX RANK';
    if (rank.nextAt !== null) {
        const segStart = getXP(rank.minFiles, 0);
        const segEnd = getXP(rank.nextAt, 0);
        const segCur = getXP(indexedCount, chatCount);
        barPct = Math.min(100, Math.round(((segCur - segStart) / (segEnd - segStart)) * 100));
        const filesNeeded = rank.nextAt - indexedCount;
        xpLabel = filesNeeded === 1
            ? `1 file to ${RANKS[rank.level + 1]?.name ?? 'Legend'}`
            : `${filesNeeded} files to ${RANKS[rank.level + 1]?.name ?? 'Legend'}`;
    }

    return (
        <div
            className="relative flex items-center gap-3 min-w-0"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {/* Rank icon badge */}
            <span
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl"
                style={{
                    background: `color-mix(in srgb, ${rank.color} 15%, transparent)`,
                    border: `1.5px solid color-mix(in srgb, ${rank.color} 35%, transparent)`,
                }}
            >
                <Icon className="w-4 h-4" style={{ color: rank.color }} />
            </span>

            {/* Text + bar */}
            <div className="flex flex-col gap-1 min-w-0">
                {/* Rank name + level */}
                <div className="flex items-center gap-1.5">
                    <span
                        className="text-xs font-semibold leading-none"
                        style={{ color: rank.color }}
                    >
                        {rank.name}
                    </span>
                    <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                        style={{
                            background: `color-mix(in srgb, ${rank.color} 15%, transparent)`,
                            color: rank.color,
                        }}
                    >
                        Lv.{rank.level}
                    </span>
                </div>

                {/* XP progress bar */}
                <div className="flex items-center gap-2">
                    <div
                        className="relative h-1.5 rounded-full overflow-hidden flex-1"
                        style={{
                            background: 'var(--color-bg-tertiary)',
                            minWidth: '80px',
                            maxWidth: '160px',
                        }}
                    >
                        <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                            style={{
                                width: `${barPct}%`,
                                background: rank.nextAt === null
                                    ? `linear-gradient(90deg, ${rank.color}, ${rank.color})`
                                    : `linear-gradient(90deg, color-mix(in srgb, ${rank.color} 70%, transparent), ${rank.color})`,
                                boxShadow: `0 0 6px color-mix(in srgb, ${rank.color} 60%, transparent)`,
                            }}
                        />
                    </div>
                    <span
                        className="text-[10px] leading-none font-medium shrink-0"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        {formatXP(xp)} XP
                    </span>
                </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px shrink-0" style={{ background: 'var(--color-border-primary)' }} />

            {/* Stats */}
            <div className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-center gap-0.5">
                    <span
                        className="text-sm font-bold leading-none"
                        style={{ color: 'var(--color-text-primary)' }}
                    >
                        {indexedCount}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] leading-none"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <FileCheck2 className="w-2.5 h-2.5" />
                        indexed
                    </span>
                </div>

                <div className="flex flex-col items-center gap-0.5">
                    <span
                        className="text-sm font-bold leading-none"
                        style={{ color: 'var(--color-text-primary)' }}
                    >
                        {totalFiles}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] leading-none"
                        style={{ color: 'var(--color-text-muted)' }}>
                        total files
                    </span>
                </div>

                <div className="flex flex-col items-center gap-0.5">
                    <span
                        className="text-sm font-bold leading-none"
                        style={{ color: 'var(--color-text-primary)' }}
                    >
                        {chatCount}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] leading-none"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <MessageSquare className="w-2.5 h-2.5" />
                        chats
                    </span>
                </div>
            </div>

            {/* Hover tooltip: next rank info */}
            {showTooltip && rank.nextAt !== null && (
                <div
                    className="absolute top-full left-0 mt-2 z-50 px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-xl"
                    style={{
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border-primary)',
                        color: 'var(--color-text-secondary)',
                    }}
                >
                    <span style={{ color: 'var(--color-text-muted)' }}>Next rank — </span>
                    <span
                        className="font-semibold"
                        style={{ color: RANKS[rank.level + 1]?.color ?? rank.color }}
                    >
                        {RANKS[rank.level + 1]?.name}
                    </span>
                    <ChevronRight className="inline w-3 h-3 mx-0.5" style={{ color: 'var(--color-text-muted)' }} />
                    <span className="font-medium">{xpLabel}</span>
                </div>
            )}
        </div>
    );
}

import { useFiles } from '@/hooks/useUpload';
import { ProcessingStage, ProcessingStatus } from '@/types/upload.types';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Cpu, Film, Database, CheckCircle2, AlertCircle } from 'lucide-react';

const STAGES = [
    {
        stage: ProcessingStage.UPLOAD,
        icon: Upload,
        label: 'Upload',
        short: 'Up',
    },
    {
        stage: ProcessingStage.EMBEDDING,
        icon: Cpu,
        label: 'Embed',
        short: 'Em',
    },
    {
        stage: ProcessingStage.SCENE_DETECTION,
        icon: Film,
        label: 'Scene',
        short: 'Sc',
    },
    {
        stage: ProcessingStage.INDEXING,
        icon: Database,
        label: 'Index',
        short: 'Idx',
    },
    {
        stage: ProcessingStage.COMPLETED,
        icon: CheckCircle2,
        label: 'Done',
        short: 'Done',
    },
] as const;

export function PipelinePulse() {
    const navigate = useNavigate();

    const { data } = useFiles(
        { limit: 200 },
        {
            refetchInterval: (query) => {
                const files = query.state.data?.files ?? [];
                const hasActive = files.some(
                    (f) => f.processingStatus === ProcessingStatus.IN_PROGRESS
                );
                return hasActive ? 3000 : false;
            },
        }
    );

    const files = data?.files ?? [];

    // Count files per stage
    const counts = Object.fromEntries(
        Object.values(ProcessingStage).map((s) => [s, 0])
    ) as Record<ProcessingStage, number>;
    for (const f of files) counts[f.processingStage]++;

    const activeCount = files.filter(
        (f) => f.processingStatus === ProcessingStatus.IN_PROGRESS
    ).length;
    const failedCount = files.filter(
        (f) => f.processingStatus === ProcessingStatus.FAILED
    ).length;
    const totalCount = files.length;

    // Determine which stages have actively processing files
    const activeStages = new Set(
        files
            .filter((f) => f.processingStatus === ProcessingStatus.IN_PROGRESS)
            .map((f) => f.processingStage)
    );

    return (
        <button
            onClick={() => navigate({ to: '/files' })}
            title="Click to view all files"
            className="group flex items-center gap-3 h-9 px-3 rounded-lg border cursor-pointer transition-all duration-200"
            style={{
                background: 'var(--color-bg-tertiary)',
                borderColor: 'var(--color-border-primary)',
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                    'var(--color-accent-primary)';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                    'var(--color-border-primary)';
            }}
        >
            {/* Live dot */}
            <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
                {activeCount > 0 ? (
                    <>
                        <span
                            className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping"
                            style={{ background: 'var(--color-accent-primary)' }}
                        />
                        <span
                            className="relative inline-flex w-2 h-2 rounded-full"
                            style={{ background: 'var(--color-accent-primary)' }}
                        />
                    </>
                ) : (
                    <span
                        className="inline-flex w-2 h-2 rounded-full"
                        style={{
                            background:
                                failedCount > 0
                                    ? 'var(--color-error)'
                                    : 'var(--color-success)',
                        }}
                    />
                )}
            </span>

            {/* Pipeline stages */}
            <div className="flex items-center gap-1">
                {STAGES.map(({ stage, icon: Icon, label }, i) => {
                    const count = counts[stage];
                    const isActive = activeStages.has(stage);
                    const isCompleted = stage === ProcessingStage.COMPLETED;

                    return (
                        <span key={stage} className="flex items-center gap-1">
                            {/* connector */}
                            {i > 0 && (
                                <span
                                    className="text-xs select-none"
                                    style={{ color: 'var(--color-text-muted)' }}
                                >
                                    ›
                                </span>
                            )}

                            <span
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors duration-150"
                                style={{
                                    background: isActive
                                        ? 'color-mix(in srgb, var(--color-accent-primary) 15%, transparent)'
                                        : count > 0 && isCompleted
                                            ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                                            : count > 0
                                                ? 'color-mix(in srgb, var(--color-text-muted) 15%, transparent)'
                                                : 'transparent',
                                    color: isActive
                                        ? 'var(--color-accent-primary)'
                                        : count > 0 && isCompleted
                                            ? 'var(--color-success)'
                                            : count > 0
                                                ? 'var(--color-text-secondary)'
                                                : 'var(--color-text-muted)',
                                }}
                            >
                                <Icon className="w-3 h-3 shrink-0" />
                                <span>{label}</span>
                                {count > 0 && (
                                    <span
                                        className="ml-0.5 font-bold tabular-nums"
                                        style={{
                                            color: isActive
                                                ? 'var(--color-accent-primary)'
                                                : 'inherit',
                                        }}
                                    >
                                        {count}
                                    </span>
                                )}
                            </span>
                        </span>
                    );
                })}
            </div>

            {/* Summary */}
            <span
                className="text-xs shrink-0 pl-1 border-l"
                style={{
                    borderColor: 'var(--color-border-primary)',
                    color:
                        activeCount > 0
                            ? 'var(--color-accent-primary)'
                            : failedCount > 0
                                ? 'var(--color-error)'
                                : 'var(--color-text-muted)',
                }}
            >
                {activeCount > 0 ? (
                    <span className="font-medium">{activeCount} processing</span>
                ) : failedCount > 0 ? (
                    <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {failedCount} failed
                    </span>
                ) : totalCount === 0 ? (
                    'no files'
                ) : (
                    `${totalCount} total`
                )}
            </span>
        </button>
    );
}

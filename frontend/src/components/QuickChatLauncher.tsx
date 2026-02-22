import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useFiles } from '@/hooks/useUpload';
import { FileType, ProcessingStage, UploadStatus } from '@/types/upload.types';
import type { FileResponseDto } from '@/types/upload.types';
import {
    MessageSquare,
    FileVideo,
    FileImage,
    FileAudio,
    FileText,
    File,
    Youtube,
    Zap,
    ArrowRight,
    Inbox,
} from 'lucide-react';

const FILE_ICONS: Record<FileType, { icon: typeof FileVideo; color: string }> = {
    VIDEO: { icon: FileVideo, color: 'var(--color-accent-primary)' },
    YOUTUBE_VIDEO: { icon: Youtube, color: '#ef4444' },
    IMAGE: { icon: FileImage, color: '#22c55e' },
    AUDIO: { icon: FileAudio, color: '#a855f7' },
    DOCUMENT: { icon: FileText, color: '#3b82f6' },
    OTHER: { icon: File, color: 'var(--color-text-muted)' },
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ file, onClick }: { file: FileResponseDto; onClick: () => void }) {
    const cfg = FILE_ICONS[file.fileType] ?? FILE_ICONS.OTHER;
    const Icon = cfg.icon;
    const [hovered, setHovered] = useState(false);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors duration-100"
            style={{
                background: hovered
                    ? 'color-mix(in srgb, var(--color-accent-primary) 8%, transparent)'
                    : 'transparent',
            }}
        >
            <span
                className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)` }}
            >
                <Icon className="w-4 h-4" style={{ color: cfg.color }} />
            </span>

            <span className="flex-1 min-w-0">
                <span
                    className="block text-sm font-medium truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                    title={file.originalFilename}
                >
                    {file.originalFilename}
                </span>
                <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatBytes(file.fileSize)}
                </span>
            </span>

            <span
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md shrink-0 transition-opacity duration-100"
                style={{
                    opacity: hovered ? 1 : 0,
                    background: 'color-mix(in srgb, var(--color-accent-primary) 15%, transparent)',
                    color: 'var(--color-accent-primary)',
                }}
            >
                <MessageSquare className="w-3 h-3" />
                Chat
            </span>
        </button>
    );
}

export function QuickChatLauncher() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    const { data } = useFiles({ limit: 20, uploadStatus: UploadStatus.COMPLETED });

    const readyFiles = (data?.files ?? [])
        .filter((f) => f.processingStage === ProcessingStage.COMPLETED)
        .slice(0, 8);

    // Position dropdown under trigger
    useEffect(() => {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 6,
                left: rect.left,
                width: Math.max(rect.width, 320),
            });
        }
    }, [open]);

    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent && e.key === 'Escape') {
                setOpen(false);
                return;
            }
            if (e instanceof MouseEvent) {
                if (
                    !triggerRef.current?.contains(e.target as Node) &&
                    !dropdownRef.current?.contains(e.target as Node)
                ) {
                    setOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('keydown', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('keydown', handler);
        };
    }, [open]);

    const goToChat = (file: FileResponseDto) => {
        setOpen(false);
        navigate({ to: '/files/$id/chat', params: { id: file.id } });
    };

    const goToAllFiles = () => {
        setOpen(false);
        navigate({ to: '/files' });
    };

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-all duration-150"
                style={{
                    background: open
                        ? 'color-mix(in srgb, var(--color-accent-primary) 12%, transparent)'
                        : 'var(--color-bg-tertiary)',
                    borderColor: open
                        ? 'var(--color-accent-primary)'
                        : 'var(--color-border-primary)',
                    color: open ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                    if (!open) {
                        (e.currentTarget as HTMLElement).style.borderColor =
                            'var(--color-accent-primary)';
                        (e.currentTarget as HTMLElement).style.color =
                            'var(--color-accent-primary)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!open) {
                        (e.currentTarget as HTMLElement).style.borderColor =
                            'var(--color-border-primary)';
                        (e.currentTarget as HTMLElement).style.color =
                            'var(--color-text-secondary)';
                    }
                }}
            >
                <Zap className="w-4 h-4 shrink-0" />
                <span>Quick Chat</span>
                {readyFiles.length > 0 && (
                    <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                            background: open
                                ? 'var(--color-accent-primary)'
                                : 'color-mix(in srgb, var(--color-accent-primary) 20%, transparent)',
                            color: open ? '#fff' : 'var(--color-accent-primary)',
                            minWidth: '1.25rem',
                            textAlign: 'center',
                        }}
                    >
                        {readyFiles.length}
                    </span>
                )}
            </button>

            {open &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed z-50 rounded-xl border shadow-xl overflow-hidden"
                        style={{
                            top: coords.top,
                            left: coords.left,
                            width: coords.width,
                            background: 'var(--color-bg-primary)',
                            borderColor: 'var(--color-border-primary)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-3 py-2.5 border-b"
                            style={{
                                borderColor: 'var(--color-border-primary)',
                                background: 'var(--color-bg-secondary)',
                            }}
                        >
                            <span
                                className="text-xs font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                Ready to chat
                            </span>
                            <button
                                onClick={goToAllFiles}
                                className="flex items-center gap-1 text-xs font-medium transition-colors"
                                style={{ color: 'var(--color-accent-primary)' }}
                            >
                                All files
                                <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>

                        {/* File list */}
                        <div className="p-2 max-h-72 overflow-y-auto">
                            {readyFiles.length === 0 ? (
                                <div
                                    className="flex flex-col items-center justify-center py-8 gap-2"
                                    style={{ color: 'var(--color-text-muted)' }}
                                >
                                    <Inbox className="w-7 h-7 opacity-40" />
                                    <span className="text-sm">No processed files yet</span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    {readyFiles.map((file) => (
                                        <FileRow key={file.id} file={file} onClick={() => goToChat(file)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}

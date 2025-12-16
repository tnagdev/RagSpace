import { type FC } from 'react';
import { FileVideo, FileImage, FileAudio, FileText, File, Trash2, Download } from 'lucide-react';
import type { FileResponseDto, FileType } from '@/types/upload.types';
import Button from '@/components/Button';

interface FileCardProps {
    file: FileResponseDto;
    onDelete?: (id: string) => void;
}

const fileTypeConfig: Record<FileType, { icon: typeof FileVideo; color: string }> = {
    VIDEO: { icon: FileVideo, color: 'text-blue-400' },
    IMAGE: { icon: FileImage, color: 'text-green-400' },
    AUDIO: { icon: FileAudio, color: 'text-purple-400' },
    DOCUMENT: { icon: FileText, color: 'text-orange-400' },
    OTHER: { icon: File, color: 'text-gray-400' },
};

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (date: Date | string): string => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString();
};

export const FileCard: FC<FileCardProps> = ({ file, onDelete }) => {
    const config = fileTypeConfig[file.fileType];
    const Icon = config.icon;

    return (
        <div className="group bg-bg-secondary rounded-xl border border-sidebar-border hover:border-accent-primary transition-all overflow-hidden">
            {/* File Icon/Thumbnail Section */}
            <div className="aspect-video bg-bg-tertiary flex items-center justify-center relative">
                <Icon className={`w-16 h-16 ${config.color}`} />

                {/* Action buttons overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download className="w-4 h-4" />}
                        onClick={() => {
                            if (file.s3Url) {
                                window.open(file.s3Url, '_blank');
                            }
                        }}
                    >
                        Download
                    </Button>
                    {onDelete && (
                        <Button
                            variant="danger"
                            size="sm"
                            icon={<Trash2 className="w-4 h-4" />}
                            onClick={() => onDelete(file.id)}
                        >
                            Delete
                        </Button>
                    )}
                </div>
            </div>

            {/* File Info Section */}
            <div className="p-4">
                <h3 className="text-sm font-semibold text-text-primary truncate mb-2" title={file.originalFilename}>
                    {file.originalFilename}
                </h3>

                <div className="space-y-1 text-xs text-text-muted">
                    <div className="flex items-center justify-between">
                        <span>Size:</span>
                        <span className="text-text-secondary">{formatFileSize(file.fileSize)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Type:</span>
                        <span className="text-text-secondary capitalize">{file.fileType.toLowerCase()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Uploaded:</span>
                        <span className="text-text-secondary">
                            {file.uploadedAt ? formatDate(file.uploadedAt) : 'Processing...'}
                        </span>
                    </div>
                    {file.metadata && typeof file.metadata === 'object' && (
                        <>
                            {(file.metadata as any).duration && (
                                <div className="flex items-center justify-between">
                                    <span>Duration:</span>
                                    <span className="text-text-secondary">
                                        {Math.floor((file.metadata as any).duration / 60)}:{String(Math.floor((file.metadata as any).duration % 60)).padStart(2, '0')}
                                    </span>
                                </div>
                            )}
                            {(file.metadata as any).dimensions && (
                                <div className="flex items-center justify-between">
                                    <span>Dimensions:</span>
                                    <span className="text-text-secondary">
                                        {(file.metadata as any).dimensions}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Status badge */}
                <div className="mt-3 pt-3 border-t border-sidebar-border">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">Status:</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                            ✓ Completed
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

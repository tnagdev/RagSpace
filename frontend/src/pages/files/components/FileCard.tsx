import { type FC, useState } from 'react';
import { FileVideo, FileImage, FileAudio, FileText, File, Trash2, Download, MoreVertical, Clock, HardDrive } from 'lucide-react';
import moment from 'moment';
import type { FileResponseDto, FileType } from '@/types/upload.types';
import Button from '@/components/Button';

interface FileCardProps {
    file: FileResponseDto;
    onDelete?: (id: string) => void;
}

const fileTypeConfig: Record<FileType, {
    icon: typeof FileVideo;
    color: string;
    bgGradient: string;
}> = {
    VIDEO: {
        icon: FileVideo,
        color: 'text-blue-400',
        bgGradient: 'from-blue-500/10 to-blue-600/5'
    },
    IMAGE: {
        icon: FileImage,
        color: 'text-green-400',
        bgGradient: 'from-green-500/10 to-green-600/5'
    },
    AUDIO: {
        icon: FileAudio,
        color: 'text-purple-400',
        bgGradient: 'from-purple-500/10 to-purple-600/5'
    },
    DOCUMENT: {
        icon: FileText,
        color: 'text-orange-400',
        bgGradient: 'from-orange-500/10 to-orange-600/5'
    },
    OTHER: {
        icon: File,
        color: 'text-gray-400',
        bgGradient: 'from-gray-500/10 to-gray-600/5'
    },
};

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const FileCard: FC<FileCardProps> = ({ file, onDelete }) => {
    const [showMenu, setShowMenu] = useState(false);
    const config = fileTypeConfig[file.fileType];
    const Icon = config.icon;

    return (
        <div className="group relative rounded-2xl border border-accent-primary/40 bg-bg-secondary/50 hover:bg-bg-secondary/70 hover:border-accent-primary/60 transition-all duration-300 overflow-hidden">
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5 pointer-events-none" />

            {/* Content */}
            <div className="relative p-5">
                {/* Header Section */}
                <div className="flex items-start justify-between mb-4">
                    {/* Icon with gradient background */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br ${config.bgGradient} border border-sidebar-border/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        <Icon className={`w-7 h-7 ${config.color}`} />
                    </div>

                    {/* Actions Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors"
                        >
                            <MoreVertical className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                        </button>

                        {showMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowMenu(false)}
                                />
                                <div className="absolute right-0 top-full mt-2 w-44 bg-bg-secondary border border-sidebar-border rounded-xl shadow-2xl z-20 overflow-hidden backdrop-blur-xl">
                                    <button
                                        onClick={() => {
                                            if (file.s3Url) window.open(file.s3Url, '_blank');
                                            setShowMenu(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-sidebar-hover transition-all flex items-center gap-3"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download
                                    </button>
                                    {onDelete && (
                                        <button
                                            onClick={() => {
                                                onDelete(file.id);
                                                setShowMenu(false);
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-3"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* File Name */}
                <h3
                    className="text-base font-semibold text-text-primary truncate mb-1 group-hover:text-accent-primary transition-colors"
                    title={file.originalFilename}
                >
                    {file.originalFilename}
                </h3>

                {/* File Type Badge */}
                <div className="mb-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium capitalize border border-sidebar-border/50"
                        style={{
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1))',
                        }}
                    >
                        {file.fileType.toLowerCase()}
                    </span>
                </div>

                {/* File Info Grid */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5" />
                            Size
                        </span>
                        <span className="text-text-secondary font-medium">{formatFileSize(file.fileSize)}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Uploaded
                        </span>
                        <span className="text-text-secondary font-medium truncate ml-2 max-w-[120px]" title={file.uploadedAt ? moment(file.uploadedAt).fromNow() : 'Processing...'}>
                            {file.uploadedAt ? moment(file.uploadedAt).fromNow() : 'Processing...'}
                        </span>
                    </div>

                    {file.metadata && typeof file.metadata === 'object' && (
                        <>
                            {(file.metadata as any).duration && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-text-muted">Duration</span>
                                    <span className="text-text-secondary font-medium">
                                        {Math.floor((file.metadata as any).duration / 60)}:{String(Math.floor((file.metadata as any).duration % 60)).padStart(2, '0')}
                                    </span>
                                </div>
                            )}
                            {(file.metadata as any).dimensions && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-text-muted">Dimensions</span>
                                    <span className="text-text-secondary font-medium">
                                        {(file.metadata as any).dimensions}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

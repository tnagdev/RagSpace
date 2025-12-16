import { type FC } from 'react';
import { Folder, MoreVertical, Film, Music, FileText, Image } from 'lucide-react';
import { IconButton } from '../../../components/IconButton';
import type { FileType } from '@/types/upload.types';

export interface FolderData {
    fileType: FileType;
    count: number;
    totalSize: number;
}

interface FolderCardProps {
    folder: FolderData;
    onClick?: (folder: FolderData) => void;
}

const fileTypeConfig: Record<FileType, { label: string; icon: FC<{ className?: string }>; gradient: string }> = {
    IMAGE: { label: 'Images', icon: Image, gradient: 'from-blue-400 to-blue-500' },
    VIDEO: { label: 'Videos', icon: Film, gradient: 'from-purple-400 to-purple-500' },
    AUDIO: { label: 'Audio', icon: Music, gradient: 'from-green-400 to-green-500' },
    DOCUMENT: { label: 'Documents', icon: FileText, gradient: 'from-orange-400 to-orange-500' },
    OTHER: { label: 'Other Files', icon: Folder, gradient: 'from-gray-400 to-gray-500' },
};

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const FolderCard: FC<FolderCardProps> = ({ folder, onClick }) => {
    const config = fileTypeConfig[folder.fileType];
    const Icon = config.icon;

    return (
        <div
            onClick={() => onClick?.(folder)}
            className="group relative bg-bg-secondary border border-sidebar-border rounded-xl p-4 hover:bg-bg-tertiary hover:border-accent-primary/30 transition-all cursor-pointer"
        >
            <div className="flex items-start justify-between mb-3">
                <div className={`w-14 h-14 rounded-xl bg-linear-to-br ${config.gradient} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                </div>
                <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<MoreVertical className="w-4 h-4" />}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        // Handle menu click
                    }}
                />
            </div>

            <h3 className="text-sm font-semibold text-text-primary mb-2">
                {config.label}
            </h3>

            <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Total files</span>
                    <span className="text-text-secondary font-medium">
                        {folder.count} {folder.count === 1 ? 'file' : 'files'}
                    </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Total size</span>
                    <span className="text-text-secondary font-medium">
                        {formatFileSize(folder.totalSize)}
                    </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Type</span>
                    <span className="text-text-secondary font-medium">{folder.fileType}</span>
                </div>
            </div>
        </div>
    );
};
import { type FC, useState } from 'react';
import { FileVideo, FileImage, FileAudio, FileText, File, Trash2, Download, Eye } from 'lucide-react';
import moment from 'moment';
import type { FileResponseDto, FileType } from '@/types/upload.types';
import Button from '@/components/Button';

interface FileTableRowProps {
    file: FileResponseDto;
    onDelete?: (id: string) => void;
}

const fileTypeConfig: Record<FileType, {
    icon: typeof FileVideo;
    color: string;
}> = {
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

export const FileTableRow: FC<FileTableRowProps> = ({ file, onDelete }) => {
    const [showActions, setShowActions] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fileConfig = fileTypeConfig[file.fileType] || fileTypeConfig.OTHER;
    const IconComponent = fileConfig.icon;

    const handleDownload = () => {
        if (file.s3Url) {
            window.open(file.s3Url, '_blank');
        }
    };

    const handleView = () => {
        if (file.s3Url) {
            window.open(file.s3Url, '_blank');
        }
    };

    const handleDelete = async () => {
        if (window.confirm(`Are you sure you want to delete "${file.originalFilename}"?`)) {
            setIsDeleting(true);
            try {
                await onDelete?.(file.id);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    return (
        <div
            className="group mb-3 p-4 rounded-lg border border-accent-primary/30 bg-surface-secondary hover:bg-surface-tertiary hover:border-accent-primary transition-all duration-200"
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            <div className="flex items-center gap-4">
                {/* Icon & Name Section */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-divider">
                        {file.thumbnailUrl ? (
                            <img
                                src={file.thumbnailUrl}
                                alt={file.originalFilename}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const iconDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (iconDiv) iconDiv.style.display = 'flex';
                                }}
                            />
                        ) : null}
                        <div
                            className={`w-full h-full bg-surface-tertiary flex items-center justify-center ${fileConfig.color}`}
                            style={{ display: file.thumbnailUrl ? 'none' : 'flex' }}
                        >
                            <IconComponent className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary group-hover:text-accent-primary truncate max-w-xs transition-colors duration-200">
                            {file.originalFilename}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                            {file.filename}
                        </p>
                    </div>
                </div>

                {/* Metadata Section */}
                <div className="hidden md:flex items-center gap-6 shrink-0">
                    {/* Type Badge */}
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted uppercase">Type</span>
                        <span className={`text-xs font-semibold ${fileConfig.color}`}>
                            {file.fileType}
                        </span>
                    </div>

                    {/* Size */}
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted uppercase">Size</span>
                        <span className="text-xs font-medium text-text-secondary">
                            {formatFileSize(file.fileSize)}
                        </span>
                    </div>

                    {/* Date */}
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted uppercase">Uploaded</span>
                        <span className="text-xs font-medium text-text-secondary">
                            {moment(file.createdAt).format('MMM D, YYYY')}
                        </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted uppercase">Status</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            {file.processingStage}
                        </span>
                    </div>
                </div>

                {/* Actions Section */}
                <div className={`flex items-center gap-1 shrink-0 transition-opacity duration-200 ${showActions ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="w-4 h-4" />}
                        onClick={handleView}
                        disabled={!file.s3Url}
                        title="View"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Download className="w-4 h-4" />}
                        onClick={handleDownload}
                        disabled={!file.s3Url}
                        title="Download"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Delete"
                    />
                </div>
            </div>
        </div>
    );
};

import { type FC } from 'react';
import { FileText, X, Image, Film, Music, File, Loader2 } from 'lucide-react';
import { IconButton } from '../../../components/IconButton';
import { ProgressBar } from '../../../components/ProgressBar';
import type { FileResponseDto, ProcessingStage } from '@/types/upload.types';

interface FileUploadItemProps {
    file: FileResponseDto;
    progress: number;
    onCancel?: (id: string) => void;
}

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const getStatusText = (stage: ProcessingStage): string => {
    switch (stage) {
        case 'UPLOAD':
            return 'Uploading';
        case 'EMBEDDING':
            return 'Generating embeddings';
        case 'SCENE_DETECTION':
            return 'Detecting scenes';
        case 'INDEXING':
            return 'Indexing';
        case 'COMPLETED':
            return 'Complete';
        default:
            return 'Processing';
    }
};

export const FileUploadItem: FC<FileUploadItemProps> = ({ file, progress, onCancel }) => {
    const getFileIcon = () => {
        const iconClass = 'w-10 h-10 rounded-lg flex items-center justify-center';

        switch (file.fileType) {
            case 'IMAGE':
                return (
                    <div className={`${iconClass} bg-blue-500/20`}>
                        <Image className="w-5 h-5 text-blue-500" />
                    </div>
                );
            case 'VIDEO':
                return (
                    <div className={`${iconClass} bg-purple-500/20`}>
                        <Film className="w-5 h-5 text-purple-500" />
                    </div>
                );
            case 'AUDIO':
                return (
                    <div className={`${iconClass} bg-green-500/20`}>
                        <Music className="w-5 h-5 text-green-500" />
                    </div>
                );
            case 'DOCUMENT':
                return (
                    <div className={`${iconClass} bg-orange-500/20`}>
                        <FileText className="w-5 h-5 text-orange-500" />
                    </div>
                );
            default:
                return (
                    <div className={`${iconClass} bg-text-muted/20`}>
                        <File className="w-5 h-5 text-text-muted" />
                    </div>
                );
        }
    };

    const isProcessing = file.processingStage !== 'COMPLETED';

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-sidebar-border hover:border-sidebar-border/50 transition-all">
            {getFileIcon()}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-text-primary truncate">
                        {file.originalFilename}
                    </p>
                    {onCancel && isProcessing && (
                        <IconButton
                            size="sm"
                            variant="ghost"
                            icon={<X className="w-4 h-4" />}
                            onClick={() => onCancel(file.id)}
                        />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-xs text-text-muted">{formatFileSize(file.fileSize)}</p>
                    <span className="text-xs text-text-muted">•</span>
                    {isProcessing ? (
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 text-accent-primary animate-spin" />
                            <p className="text-xs text-text-secondary">
                                {getStatusText(file.processingStage)}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-success">Complete</p>
                    )}
                    {file.processingStage === 'UPLOAD' && progress > 0 && progress < 100 && (
                        <span className="text-xs text-accent-primary font-medium ml-auto">
                            {progress}%
                        </span>
                    )}
                </div>
                {isProcessing && (
                    <ProgressBar
                        progress={progress}
                        variant={file.processingStage === 'UPLOAD' ? 'default' : 'shimmer'}
                        size="md"
                        className="mt-2"
                    />
                )}
                {file.uploadStatus === 'FAILED' && file.errorMessage && (
                    <p className="text-xs text-danger mt-1">{file.errorMessage}</p>
                )}
            </div>
        </div>
    );
};
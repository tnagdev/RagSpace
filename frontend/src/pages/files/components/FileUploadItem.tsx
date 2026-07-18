import { type FC } from 'react';
import { FileText, X, Image, Film, Music, File, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { IconButton } from '../../../components/IconButton';
import { ProgressBar } from '../../../components/ProgressBar';
import type { FileResponseDto, ProcessingStage } from '@/types/upload.types';

interface FileUploadItemProps {
    file: FileResponseDto;
    progress: number;
    onCancel?: (id: string) => void;
    onRetry?: (id: string) => void;
    failed?: boolean;
    eta?: string;
    processingRetryCount?: number;
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

export const FileUploadItem: FC<FileUploadItemProps> = ({
    file,
    progress,
    onCancel,
    onRetry,
    failed,
    eta,
    processingRetryCount,
}) => {
    const retryCount = processingRetryCount ?? 0;

    // Upload failure: S3 upload failed or upload manager marked FAILED
    const isUploadFailed = (failed || file.uploadStatus === 'FAILED') && file.processingStage !== 'SCENE_DETECTION' && file.processingStage !== 'INDEXING' && file.processingStage !== 'EMBEDDING';
    // Permanent processing failure after all retries exhausted
    const isPermanentlyFailed = !isUploadFailed && file.processingStatus === 'FAILED';
    // Auto-retry in progress (retryCount > 0 means at least one retry has occurred)
    const isRetrying = !isUploadFailed && !isPermanentlyFailed
        && file.processingStatus === 'IN_PROGRESS'
        && retryCount > 0;
    const isCompleted = file.processingStage === 'COMPLETED';
    const isProcessing = !isCompleted && !isUploadFailed && !isPermanentlyFailed;

    const progressVariant = progress > 0 ? 'default' : 'shimmer';

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

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-sidebar-border hover:border-sidebar-border/50 transition-all">
            {getFileIcon()}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-text-primary truncate">
                        {file.originalFilename}
                    </p>
                    {onCancel && !isCompleted && !isPermanentlyFailed && (
                        <IconButton
                            size="sm"
                            variant="ghost"
                            icon={<X className="w-4 h-4" />}
                            onClick={() => onCancel(file.id)}
                        />
                    )}
                </div>

                {isUploadFailed && (
                    <div className="flex items-center gap-2 mt-1">
                        <AlertCircle className="w-3 h-3 text-danger shrink-0" />
                        <p className="text-xs text-danger">Upload failed</p>
                        {onRetry && (
                            <button
                                onClick={() => onRetry(file.id)}
                                className="flex items-center gap-1 text-xs text-accent-primary hover:underline ml-auto"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Retry
                            </button>
                        )}
                    </div>
                )}

                {isPermanentlyFailed && (
                    <div className="flex items-center gap-2 mt-1">
                        <AlertCircle className="w-3 h-3 text-danger shrink-0" />
                        <p className="text-xs text-danger">Processing failed</p>
                        {onCancel && (
                            <button
                                onClick={() => onCancel(file.id)}
                                className="flex items-center gap-1 text-xs text-danger hover:underline ml-auto"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                )}

                {!isUploadFailed && !isPermanentlyFailed && (
                    <>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-text-muted">{formatFileSize(file.fileSize)}</p>
                            <span className="text-xs text-text-muted">•</span>
                            {isRetrying ? (
                                <div className="flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 text-warning animate-spin" />
                                    <p className="text-xs text-warning">
                                        Retrying ({retryCount}/3)
                                    </p>
                                </div>
                            ) : isProcessing ? (
                                <div className="flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 text-accent-primary animate-spin" />
                                    <p className="text-xs text-text-secondary">
                                        {getStatusText(file.processingStage)}
                                        {eta && (
                                            <span className="text-text-muted ml-1">· {eta}</span>
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-success">Complete</p>
                            )}
                            {(isProcessing || isRetrying) && progress > 0 && progress < 100 && (
                                <span className="text-xs text-accent-primary font-medium ml-auto">
                                    {progress}%
                                </span>
                            )}
                        </div>
                        {(isProcessing || isRetrying) && (
                            <ProgressBar
                                progress={progress}
                                variant={progressVariant}
                                size="md"
                                className="mt-2"
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

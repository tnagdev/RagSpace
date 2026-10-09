import { type FC, useEffect } from 'react';
import { FileUploadItem } from './FileUploadItem';
import type { ApiFile } from '@/api/types';

interface ProcessingFileItemProps {
    fileId: string;
    initialFile: ApiFile;
    progress: number;
    onComplete?: (file: ApiFile) => void;
    onCancel: (id: string) => void;
    onRetry?: (id: string) => void;
    latestFile?: ApiFile;
    failed?: boolean;
    eta?: string;
    processingRetryCount?: number;
}

export const ProcessingFileItem: FC<ProcessingFileItemProps> = ({
    fileId: _fileId,
    initialFile,
    progress,
    onComplete,
    onCancel,
    onRetry,
    latestFile,
    failed,
    eta,
    processingRetryCount,
}) => {
    const file = latestFile || initialFile;

    useEffect(() => {
        if (file.processingStage === 'COMPLETED' && onComplete) {
            onComplete(file);
        }
    }, [file.processingStage, onComplete, file]);

    const isFailed = failed || file.processingStatus === 'FAILED' || file.uploadStatus === 'FAILED';

    return (
        <FileUploadItem
            file={file}
            progress={progress}
            onCancel={onCancel}
            onRetry={onRetry}
            failed={isFailed}
            eta={eta}
            processingRetryCount={processingRetryCount}
        />
    );
};

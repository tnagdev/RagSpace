import { type FC, useEffect } from 'react';
import { FileUploadItem } from './FileUploadItem';
import type { FileResponseDto } from '@/types/upload.types';

interface ProcessingFileItemProps {
    fileId: string;
    initialFile: FileResponseDto;
    progress: number;
    onComplete?: (file: FileResponseDto) => void;
    onCancel: (id: string) => void;
    onRetry?: (id: string) => void;
    latestFile?: FileResponseDto;
    failed?: boolean;
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
        />
    );
};

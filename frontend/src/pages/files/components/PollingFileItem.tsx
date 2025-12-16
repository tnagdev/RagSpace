import { type FC, useEffect } from 'react';
import { FileUploadItem } from './FileUploadItem';
import type { FileResponseDto } from '@/types/upload.types';

interface PollingFileItemProps {
    fileId: string;
    initialFile: FileResponseDto;
    progress: number;
    onComplete?: (file: FileResponseDto) => void;
    onCancel: (id: string) => void;
    latestFile?: FileResponseDto;
}

export const PollingFileItem: FC<PollingFileItemProps> = ({
    fileId,
    initialFile,
    progress,
    onComplete,
    onCancel,
    latestFile,
}) => {
    const file = latestFile || initialFile;
    useEffect(() => {
        if (file.processingStage === 'COMPLETED' && onComplete) {
            onComplete(file);
        }
    }, [file.processingStage, onComplete, file]);

    return (
        <FileUploadItem
            file={file}
            progress={progress}
            onCancel={onCancel}
        />
    );
};

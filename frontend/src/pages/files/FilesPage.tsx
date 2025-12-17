import { useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { FileUploadZone } from './components/FileUploadZone';
import { PollingFileItem } from './components/PollingFileItem';
import { FileCard } from './components/FileCard';
import Button from '@/components/Button';
import { useFiles, useUploadFile, useAbortMultipartUpload, useDeleteFile } from '@/hooks/useUpload';
import type { FileResponseDto } from '@/types/upload.types';

interface UploadProgress {
    [fileId: string]: number;
}

interface PollingFile {
    id: string;
    file: FileResponseDto;
}

const FilesPage = () => {
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});
    const [pollingFiles, setPollingFiles] = useState<PollingFile[]>([]);
    const hasProcessingFiles = pollingFiles.length > 0;
    const { data: filesData, isLoading: isLoadingFiles, refetch } = useFiles(
        { limit: 100 },
        {
            refetchInterval: hasProcessingFiles ? 5000 : false,
            refetchIntervalInBackground: true,
        }
    );

    const uploadMutation = useUploadFile();
    const abortMutation = useAbortMultipartUpload();
    const deleteMutation = useDeleteFile();
    const completedFiles = useMemo(() => (filesData?.files || []).filter(
        (file) => file.processingStage === 'COMPLETED'
    ), [filesData?.files]);

    const allProcessingFiles = useMemo(() => {
        const processingFilesFromAPI = (filesData?.files || []).filter(
            (file) => file.processingStage !== 'COMPLETED'
        );
        const allProcessingFiles = [
            ...pollingFiles,
            ...processingFilesFromAPI
                .filter(apiFile => !pollingFiles.some(pf => pf.id === apiFile.id))
                .map(file => ({ id: file.id, file }))
        ];
        return allProcessingFiles;
    }, [filesData?.files, pollingFiles]);

    const handleFileComplete = useCallback(
        (file: FileResponseDto) => {
            setPollingFiles((prev) => prev.filter((f) => f.id !== file.id));
        },
        []
    );

    const handleFilesSelected = useCallback(
        async (files: File[]) => {
            files.forEach(async (file) => {
                try {
                    const fakeId = `uploading-${Date.now()}-${file.name}`;
                    setPollingFiles((prev) => [...prev, {
                        id:
                            fakeId, file: {
                                id: fakeId,
                                originalFilename: file.name,
                                filename: file.name,
                                processingStage: 'UPLOAD',
                                fileSize: file.size,
                                mimeType: file.type,
                            } as any
                    }]);
                    setUploadProgress((prev) => ({
                        ...prev,
                        [fakeId]: 0,
                    }));

                    await uploadMutation.mutateAsync({
                        file,
                        onInit: (fileRecord) => {
                            setPollingFiles((prev) => prev.map((pf) => pf.id === fakeId ? { ...pf, id: fileRecord.id, file: fileRecord } : pf));
                            setUploadProgress((prev) => {
                                const newProgress = { ...prev };
                                delete newProgress[fakeId];
                                return {
                                    ...newProgress,
                                    [fileRecord.id]: 0,
                                };
                            });
                        },
                        onProgress: (fileRecord, progress) => {
                            if (fileRecord.id) {
                                setUploadProgress((prev) => ({
                                    ...prev,
                                    [fileRecord.id]: progress,
                                }));
                            }
                        },
                        onError: (error, fileRecord) => {
                            if (fileRecord && fileRecord.id) {
                                setPollingFiles((prev) => prev.filter((f) => f.id !== fileRecord.id));
                                setUploadProgress((prev) => {
                                    const newProgress = { ...prev };
                                    delete newProgress[fileRecord.id];
                                    return newProgress;
                                });
                            }
                        },
                        onComplete: (fileRecord) => {
                            setPollingFiles((prev) =>
                                prev.map((pf) => pf.id === fileRecord.id ? { ...pf, file: fileRecord } : pf)
                            );
                            setUploadProgress((prev) => {
                                const newProgress = { ...prev };
                                delete newProgress[fileRecord.id];
                                return newProgress;
                            });
                        }
                    });
                } catch (error) {
                    console.error('Failed to upload file:', error);
                }
            });
        },
        [uploadMutation]
    );

    const handleCancelUpload = useCallback(
        async (id: string) => {
            try {
                const fileToCancel = allProcessingFiles.find((f) => f.id === id);
                if (fileToCancel) {
                    if (fileToCancel.file.processingStage === 'UPLOAD') {
                        await abortMutation.mutateAsync(id);
                    } else {
                        await deleteMutation.mutateAsync(id);
                    }
                    setPollingFiles((prev) => prev.filter((f) => f.id !== id));
                    setUploadProgress((prev) => {
                        const newProgress = { ...prev };
                        delete newProgress[id];
                        return newProgress;
                    });
                }
            } catch (error) {
                console.error('Failed to cancel upload:', error);
                setPollingFiles((prev) => prev.filter((f) => f.id !== id));
            }
        },
        [abortMutation, deleteMutation, allProcessingFiles]
    );

    const handleDeleteFile = useCallback(
        async (id: string) => {
            try {
                await deleteMutation.mutateAsync(id);
                refetch();
            } catch (error) {
                console.error('Failed to delete file:', error);
            }
        },
        [deleteMutation, refetch]
    );

    return (
        <div className="flex gap-6 h-full">
            {/* Left Upload Section */}
            <div className="w-80 flex flex-col gap-4">
                <FileUploadZone onFilesSelected={handleFilesSelected} />

                {allProcessingFiles.length > 0 && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-text-primary">
                                Processing ({allProcessingFiles.length})
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {allProcessingFiles.map(({ id, file }) => {
                                const latestFile = filesData?.files.find(f => f.id === id);

                                return (
                                    <PollingFileItem
                                        key={id}
                                        fileId={id}
                                        initialFile={file}
                                        latestFile={latestFile}
                                        progress={uploadProgress[id] || 0}
                                        onComplete={handleFileComplete}
                                        onCancel={handleCancelUpload}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Main Content */}
            <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary mb-1">
                            Your Media Library
                        </h1>
                        <p className="text-sm text-text-secondary">
                            {completedFiles.length} {completedFiles.length === 1 ? 'file' : 'files'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            size="md"
                            icon={<RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />}
                            onClick={() => refetch()}
                            disabled={isLoadingFiles}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {isLoadingFiles ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-primary border-r-transparent mb-4"></div>
                                <p className="text-sm text-text-muted">Loading files...</p>
                            </div>
                        </div>
                    ) : completedFiles.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <p className="text-text-secondary mb-2">No files yet</p>
                                <p className="text-sm text-text-muted">Upload your first file to get started</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {completedFiles.map((file) => (
                                <FileCard
                                    key={file.id}
                                    file={file}
                                    onDelete={handleDeleteFile}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FilesPage;

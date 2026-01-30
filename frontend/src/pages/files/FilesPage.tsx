import { useState, useCallback, useMemo } from 'react';
import { RefreshCw, Grid3x3, List } from 'lucide-react';
import { FileUploadZone } from './components/FileUploadZone';
import { PollingFileItem } from './components/PollingFileItem';
import { FileCard } from './components/FileCard';
import { FileTableRow } from './components/FileTableRow';
import Button from '@/components/Button';
import Pagination from '@/components/Pagination';
import { useFiles, useUploadFile, useAbortMultipartUpload, useDeleteFile } from '@/hooks/useUpload';
import type { FileResponseDto } from '@/types/upload.types';
import { ProcessingStage } from '@/types/upload.types';

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
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(12);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const { data: completedFilesData, isLoading: isLoadingCompleted, refetch: refetchCompleted } = useFiles(
        { page: currentPage, limit: itemsPerPage, processingStage: ProcessingStage.COMPLETED },
        {
            refetchInterval: false,
        }
    );

    const { data: processingFilesData, refetch: refetchProcessing } = useFiles(
        { limit: 100 },
        {
            refetchInterval: 5000,
            refetchIntervalInBackground: true,
            staleTime: 0,
        }
    );

    const uploadMutation = useUploadFile();
    const abortMutation = useAbortMultipartUpload();
    const deleteMutation = useDeleteFile();

    const completedFiles = completedFilesData?.files || [];

    const allProcessingFiles = useMemo(() => {
        const processingFilesFromAPI = (processingFilesData?.files || [])
            .filter(f => f.processingStage !== ProcessingStage.COMPLETED);
        const allProcessingFiles = [
            ...pollingFiles,
            ...processingFilesFromAPI
                .filter(apiFile => !pollingFiles.some(pf => pf.id === apiFile.id))
                .map(file => ({ id: file.id, file }))
        ];
        return allProcessingFiles;
    }, [processingFilesData?.files, pollingFiles]);

    const handleFileComplete = useCallback(
        (file: FileResponseDto) => {
            setPollingFiles((prev) => prev.filter((f) => f.id !== file.id));
            refetchCompleted();
            refetchProcessing();
        },
        [refetchCompleted, refetchProcessing]
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
                        onError: (_error, fileRecord) => {
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
                refetchCompleted();
                refetchProcessing();
            } catch (error) {
                console.error('Failed to delete file:', error);
            }
        },
        [deleteMutation, refetchCompleted, refetchProcessing]
    );

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
        const contentArea = document.querySelector('.files-content-scroll');
        if (contentArea) {
            contentArea.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

    const handlePageSizeChange = useCallback((size: number) => {
        setItemsPerPage(size);
        setCurrentPage(1);
        const contentArea = document.querySelector('.files-content-scroll');
        if (contentArea) {
            contentArea.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

    const totalPages = Math.ceil((completedFilesData?.total || 0) / itemsPerPage);

    const refetchAll = useCallback(() => {
        refetchCompleted();
        refetchProcessing();
    }, [refetchCompleted, refetchProcessing]);

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
                                const latestFile = processingFilesData?.files.find(f => f.id === id);

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
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary mb-1">
                            Your Media Library
                        </h1>
                        <p className="text-sm text-text-secondary">
                            {completedFilesData?.total || 0} {completedFilesData?.total === 1 ? 'file' : 'files'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-1">
                            <Button
                                variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                                size="sm"
                                icon={<Grid3x3 className="w-4 h-4" />}
                                onClick={() => setViewMode('grid')}
                                title="Grid View"
                            />
                            <Button
                                variant={viewMode === 'table' ? 'primary' : 'ghost'}
                                size="sm"
                                icon={<List className="w-4 h-4" />}
                                onClick={() => setViewMode('table')}
                                title="Table View"
                            />
                        </div>
                        <Button
                            variant="secondary"
                            size="md"
                            icon={<RefreshCw className={`w-4 h-4 ${isLoadingCompleted ? 'animate-spin' : ''}`} />}
                            onClick={refetchAll}
                            disabled={isLoadingCompleted}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-4 files-content-scroll">
                    {isLoadingCompleted ? (
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
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {completedFiles.map((file) => (
                                <FileCard
                                    key={file.id}
                                    file={file}
                                    onDelete={handleDeleteFile}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-0">
                            {completedFiles.map((file) => (
                                <FileTableRow
                                    key={file.id}
                                    file={file}
                                    onDelete={handleDeleteFile}
                                />
                            ))}
                        </div>
                    )}
                </div>
                {!isLoadingCompleted && totalPages > 1 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={completedFilesData?.total || 0}
                        itemsPerPage={itemsPerPage}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        pageSizeOptions={[12, 24, 48, 96]}
                        className="sticky bottom-0 pt-3"
                    />
                )}
            </div>
        </div>
    );
};

export default FilesPage;

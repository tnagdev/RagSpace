import { useState, useCallback, useMemo, useEffect } from 'react';
import { RefreshCw, Grid3x3, List } from 'lucide-react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FileUploadZone } from './components/FileUploadZone';
import { YouTubeLinkInput } from './components/YouTubeLinkInput';
import { ProcessingFileItem } from './components/ProcessingFileItem';
import { FileCard } from './components/FileCard';
import { FileTableRow } from './components/FileTableRow';
import Button from '@/components/Button';
import Pagination from '@/components/Pagination';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import PaymentResultModal from '@/components/payment/PaymentResultModal';
import { useFiles, useUploadFile, useAbortMultipartUpload, useDeleteFile, useSubmitYouTubeLink } from '@/hooks/useUpload';
import { useFileEvents } from '@/hooks/useFileEvents';
import type { FileResponseDto } from '@/types/upload.types';
import { ProcessingStage, UploadStatus } from '@/types/upload.types';
import { CollectionSidePanel } from '@/components/CollectionSidePanel';

interface UploadProgress {
    [fileId: string]: number;
}

interface PollingFile {
    id: string;
    file: FileResponseDto;
    rawFile?: File;
    failed?: boolean;
}

function formatEta(elapsedMs: number, progress: number): string | undefined {
    if (progress < 5 || progress >= 100) return undefined;
    const secs = Math.ceil(((elapsedMs / progress) * (100 - progress)) / 1000);
    if (secs < 5) return undefined;
    return secs < 60 ? `~${secs}s` : `~${Math.ceil(secs / 60)}m`;
}

const FilesPage = () => {
    const navigate = useNavigate();
    const searchParams = useSearch({ from: '/files' }) as { payment?: string; plan?: string; error?: string };

    const [uploadMode, setUploadMode] = useState<'file' | 'youtube'>('file');
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});
    const [pollingFiles, setPollingFiles] = useState<PollingFile[]>([]);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(12);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [isCollectionPanelOpen, setIsCollectionPanelOpen] = useState(false);
    const [selectedFileForCollection, setSelectedFileForCollection] = useState<string | null>(null);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'success' | 'error' | 'cancelled'>('success');
    const [paymentPlanName, setPaymentPlanName] = useState<string | undefined>(undefined);
    const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | undefined>(undefined);

    // Handle payment redirect params
    useEffect(() => {
        if (searchParams.payment) {
            const status = searchParams.payment as 'success' | 'error' | 'cancelled';
            setPaymentStatus(status);
            setPaymentPlanName(searchParams.plan);
            setPaymentErrorMessage(searchParams.error);
            setShowPaymentModal(true);

            // Clear query params after showing modal
            navigate({
                to: '/files',
                replace: true,
            });
        }
    }, [searchParams.payment, searchParams.plan, searchParams.error, navigate]);

    const { data: completedFilesData, isLoading: isLoadingCompleted, refetch: refetchCompleted } = useFiles(
        { page: currentPage, limit: itemsPerPage, processingStage: ProcessingStage.COMPLETED },
        { refetchInterval: false }
    );

    const { data: processingFilesData, refetch: refetchProcessing } = useFiles(
        { limit: 100 },
        { staleTime: 5_000 }
    );

    const [wsProgress, setWsProgress] = useState<Record<string, number>>({});
    const [stageStartTimes, setStageStartTimes] = useState<Record<string, number>>({});

    const handleWsProgress = useCallback(
        (fileId: string, _type: string, progress: number, stage?: string) => {
            if (!stage) return;
            // Key by `fileId:stage` so EMBEDDING events never clobber SCENE_DETECTION
            // progress, and each stage independently tracks its own 0-100% progress.
            const key = `${fileId}:${stage}`;
            setWsProgress((prev) => ({ ...prev, [key]: progress }));
            // Seed the start time on the very first event for this stage (even at 0%)
            setStageStartTimes((prev) => prev[key] !== undefined ? prev : { ...prev, [key]: Date.now() });
        },
        [],
    );

    const handleWsSnapshot = useCallback(
        (snapshotFiles: Array<{ id: string; processingStage: string; uploadStatus: string; processingStatus?: string }>) => {
            // The server marks genuinely stuck UPLOAD files as FAILED before sending the
            // snapshot. Propagate that to any matching entry in pollingFiles.
            const failedIds = new Set(
                snapshotFiles.filter(f => f.uploadStatus === 'FAILED').map(f => f.id)
            );
            if (failedIds.size === 0) return;
            setPollingFiles((prev) =>
                prev.map((pf) => failedIds.has(pf.id) ? { ...pf, failed: true } : pf)
            );
        },
        [],
    );

    const { connected, hasConnectedOnce } = useFileEvents(handleWsProgress, handleWsSnapshot);

    const uploadMutation = useUploadFile();
    const abortMutation = useAbortMultipartUpload();
    const deleteMutation = useDeleteFile();
    const youtubeSubmitMutation = useSubmitYouTubeLink();

    const completedFiles = completedFilesData?.files || [];

    const allProcessingFiles = useMemo(() => {
        const processingFilesFromAPI = (processingFilesData?.files || [])
            .filter(f => f.processingStage !== ProcessingStage.COMPLETED);
        return [
            ...pollingFiles,
            ...processingFilesFromAPI
                .filter(apiFile => !pollingFiles.some(pf => pf.id === apiFile.id))
                .map(file => ({
                    id: file.id,
                    file,
                    rawFile: undefined as File | undefined,
                    failed: file.uploadStatus === UploadStatus.FAILED,
                }))
        ];
    }, [processingFilesData?.files, pollingFiles]);

    const handleFileComplete = useCallback(
        async (file: FileResponseDto) => {
            await refetchCompleted();
            setPollingFiles((prev) => prev.filter((f) => f.id !== file.id));
            refetchProcessing();
        },
        [refetchCompleted, refetchProcessing]
    );

    const uploadSingleFile = useCallback(
        async (rawFile: File, pollingId: string) => {
            try {
                await uploadMutation.mutateAsync({
                    file: rawFile,
                    onInit: (fileRecord) => {
                        setPollingFiles((prev) => prev.map((pf) =>
                            pf.id === pollingId ? { ...pf, id: fileRecord.id, file: fileRecord } : pf
                        ));
                        setUploadProgress((prev) => {
                            const next = { ...prev };
                            delete next[pollingId];
                            return { ...next, [fileRecord.id]: 0 };
                        });
                        setStageStartTimes((prev) => {
                            const next = { ...prev };
                            const uploadKey = `${pollingId}:UPLOAD`;
                            if (next[uploadKey]) {
                                next[`${fileRecord.id}:UPLOAD`] = next[uploadKey];
                                delete next[uploadKey];
                            }
                            return next;
                        });
                    },
                    onProgress: (fileRecord, progress) => {
                        if (fileRecord.id) {
                            setUploadProgress((prev) => ({ ...prev, [fileRecord.id]: progress }));
                        }
                    },
                    onComplete: (fileRecord) => {
                        setPollingFiles((prev) =>
                            prev.map((pf) => pf.id === fileRecord.id ? { ...pf, file: fileRecord } : pf)
                        );
                        setUploadProgress((prev) => {
                            const next = { ...prev };
                            delete next[fileRecord.id];
                            return next;
                        });
                    },
                    onError: (_error, fileRecord) => {
                        const failedId = fileRecord?.id ?? pollingId;
                        setPollingFiles((prev) =>
                            prev.map((pf) => pf.id === failedId ? { ...pf, failed: true } : pf)
                        );
                        setUploadProgress((prev) => {
                            const next = { ...prev };
                            delete next[failedId];
                            return next;
                        });
                    },
                });
            } catch {
                // onError handles the failed state
            }
        },
        [uploadMutation]
    );

    const handleFilesSelected = useCallback(
        (files: File[]) => {
            files.forEach((file) => {
                const fakeId = `uploading-${Date.now()}-${file.name}`;
                setPollingFiles((prev) => [...prev, {
                    id: fakeId,
                    file: {
                        id: fakeId,
                        originalFilename: file.name,
                        filename: file.name,
                        processingStage: 'UPLOAD',
                        fileSize: file.size,
                        mimeType: file.type,
                    } as any,
                    rawFile: file,
                    failed: false,
                }]);
                setUploadProgress((prev) => ({ ...prev, [fakeId]: 0 }));
                setStageStartTimes((prev) => ({ ...prev, [`${fakeId}:UPLOAD`]: Date.now() }));
                uploadSingleFile(file, fakeId);
            });
        },
        [uploadSingleFile]
    );

    const handleRetryUpload = useCallback(
        (id: string) => {
            const fileToRetry = pollingFiles.find((f) => f.id === id);
            if (!fileToRetry?.rawFile) return;
            setPollingFiles((prev) => prev.map((pf) => pf.id === id ? { ...pf, failed: false } : pf));
            setUploadProgress((prev) => ({ ...prev, [id]: 0 }));
            uploadSingleFile(fileToRetry.rawFile, id);
        },
        [pollingFiles, uploadSingleFile]
    );

    const handleCancelUpload = useCallback(
        async (id: string) => {
            try {
                const fileToCancel = allProcessingFiles.find((f) => f.id === id);
                if (!fileToCancel) return;
                const isFakeId = id.startsWith('uploading-') || id.startsWith('youtube-');
                if (!isFakeId) {
                    if (fileToCancel.file.processingStage === 'UPLOAD') {
                        await abortMutation.mutateAsync(id);
                    } else {
                        await deleteMutation.mutateAsync(id);
                    }
                }
                setPollingFiles((prev) => prev.filter((f) => f.id !== id));
                setUploadProgress((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            } catch (error) {
                console.error('Failed to cancel upload:', error);
                setPollingFiles((prev) => prev.filter((f) => f.id !== id));
            }
        },
        [abortMutation, deleteMutation, allProcessingFiles]
    );

    const handleDeleteFile = useCallback(
        (id: string) => {
            setFileToDelete(id);
        },
        []
    );

    const confirmDeleteFile = useCallback(
        async () => {
            if (!fileToDelete) return;
            try {
                await deleteMutation.mutateAsync(fileToDelete);
                refetchCompleted();
                refetchProcessing();
                setFileToDelete(null);
            } catch (error) {
                console.error('Failed to delete file:', error);
            }
        },
        [fileToDelete, deleteMutation, refetchCompleted, refetchProcessing]
    );

    const handleYouTubeSubmit = useCallback(
        async (url: string) => {
            try {
                const fakeId = `youtube-${Date.now()}`;
                setPollingFiles((prev) => [...prev, {
                    id: fakeId,
                    file: {
                        id: fakeId,
                        originalFilename: 'YouTube Video',
                        filename: 'YouTube Video',
                        processingStage: 'UPLOAD',
                        fileSize: 0,
                        mimeType: 'video/youtube',
                    } as any
                }]);

                const fileRecord = await youtubeSubmitMutation.mutateAsync(url);

                setPollingFiles((prev) =>
                    prev.map((pf) => pf.id === fakeId ? { ...pf, id: fileRecord.id, file: fileRecord } : pf)
                );
            } catch (error) {
                console.error('Failed to submit YouTube link:', error);
                setPollingFiles((prev) => prev.filter((f) => f.id.startsWith('youtube-')));
            }
        },
        [youtubeSubmitMutation]
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
                {/* Tab Switcher */}
                <div className="flex items-center gap-2 bg-surface-secondary rounded-lg p-1">
                    <Button
                        variant={uploadMode === 'file' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setUploadMode('file')}
                        className="flex-1"
                    >
                        Upload Files
                    </Button>
                    <Button
                        variant={uploadMode === 'youtube' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setUploadMode('youtube')}
                        className="flex-1"
                    >
                        YouTube Link
                    </Button>
                </div>

                {uploadMode === 'file' ? (
                    <FileUploadZone onFilesSelected={handleFilesSelected} />
                ) : (
                    <YouTubeLinkInput
                        onSubmit={handleYouTubeSubmit}
                        isSubmitting={youtubeSubmitMutation.isPending}
                    />
                )}

                {allProcessingFiles.length > 0 && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-text-primary">
                                Processing ({allProcessingFiles.length})
                            </h3>
                            {hasConnectedOnce && !connected && (
                                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-warning)' }}>
                                    <span
                                        className="inline-block w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: 'var(--color-warning)' }}
                                    />
                                    Reconnecting...
                                </span>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {allProcessingFiles.map(({ id, file, failed }) => {
                                const latestFile = processingFilesData?.files.find(f => f.id === id);
                                const stage = (latestFile ?? file).processingStage;
                                // Use XHR progress during upload, then stage-keyed WS progress.
                                // Keying by stage means EMBEDDING events never reset
                                // SCENE_DETECTION progress, and each stage starts cleanly at 0%.
                                const progress = uploadProgress[id] !== undefined
                                    ? uploadProgress[id]
                                    : wsProgress[`${id}:${stage}`] ?? 0;
                                const stageStart = stageStartTimes[`${id}:${stage}`];
                                const eta = stageStart ? formatEta(Date.now() - stageStart, progress) : undefined;

                                return (
                                    <ProcessingFileItem
                                        key={id}
                                        fileId={id}
                                        initialFile={file}
                                        latestFile={latestFile}
                                        progress={progress}
                                        onComplete={handleFileComplete}
                                        onCancel={handleCancelUpload}
                                        onRetry={handleRetryUpload}
                                        failed={failed || latestFile?.processingStatus === 'FAILED'}
                                        eta={eta}
                                        processingRetryCount={latestFile?.processingRetryCount}
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
                                    onAddToCollection={(fileId) => {
                                        setSelectedFileForCollection(fileId);
                                        setIsCollectionPanelOpen(true);
                                    }}
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

            {/* Collection Side Panel */}
            {selectedFileForCollection && (
                <CollectionSidePanel
                    isOpen={isCollectionPanelOpen}
                    onClose={() => {
                        setIsCollectionPanelOpen(false);
                        setSelectedFileForCollection(null);
                    }}
                    fileIds={[selectedFileForCollection]}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={fileToDelete !== null}
                onClose={() => setFileToDelete(null)}
                onConfirm={confirmDeleteFile}
                title="Delete File"
                message="Are you sure you want to delete this file? This action cannot be undone and the file cannot be recovered."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={deleteMutation.isPending}
            />

            {/* Payment Result Modal */}
            <PaymentResultModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                status={paymentStatus}
                planName={paymentPlanName}
                errorMessage={paymentErrorMessage}
            />
        </div>
    );
};

export default FilesPage;

import { useEffect, useState } from 'react';
import { FileVideo, FileImage, FileAudio, FileText, File, Search as SearchIcon, X, Check } from 'lucide-react';
import Button from '@/components/Button';
import { Drawer } from '@/components/Drawer';
import { FileResponseDto, FileType, ProcessingStatus } from '@/types/upload.types';
import { useFiles } from '@/hooks/useUpload';
import { cn } from '@/lib/utils';

interface FilePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectFiles: (files: FileResponseDto[]) => void;
    selectedFileIds: string[];
}

const FilePickerModal: React.FC<FilePickerModalProps> = ({
    isOpen,
    onClose,
    selectedFileIds,
    onSelectFiles,
}) => {
    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedFileIds));

    useEffect(() => {
        setLocalSelected(new Set(selectedFileIds));
    }, [selectedFileIds, isOpen]);

    const { data, isLoading } = useFiles(
        {
            limit: 100,
            processingStatus: ProcessingStatus.COMPLETED
        },
        { enabled: isOpen }
    );

    const toggleFile = (file: FileResponseDto) => {
        const newSelected = new Set(localSelected);
        if (newSelected.has(file.id)) {
            newSelected.delete(file.id);
        } else {
            newSelected.add(file.id);
        }
        setLocalSelected(newSelected);
    };

    const handleConfirm = () => {
        const files = data?.files.filter(f => localSelected.has(f.id)) || [];
        onSelectFiles(files);
        onClose();
    };

    const fileTypeConfig: Record<FileType, {
        icon: typeof FileVideo;
        color: string;
        bgGradient: string;
    }> = {
        VIDEO: {
            icon: FileVideo,
            color: 'text-blue-400',
            bgGradient: 'from-blue-500/10 to-blue-600/5'
        },
        IMAGE: {
            icon: FileImage,
            color: 'text-green-400',
            bgGradient: 'from-green-500/10 to-green-600/5'
        },
        AUDIO: {
            icon: FileAudio,
            color: 'text-purple-400',
            bgGradient: 'from-purple-500/10 to-purple-600/5'
        },
        DOCUMENT: {
            icon: FileText,
            color: 'text-orange-400',
            bgGradient: 'from-orange-500/10 to-orange-600/5'
        },
        OTHER: {
            icon: File,
            color: 'text-gray-400',
            bgGradient: 'from-gray-500/10 to-gray-600/5'
        },
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Attach Files"
            position="right"
            width="md"
            showFooter={true}
            className="!bg-bg-secondary"
            contentClassName="!p-5 !pb-0"
            footer={
                <div className="flex gap-2 justify-end p-4 bg-bg-secondary">
                    <Button variant="secondary" onClick={onClose} size="sm">
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleConfirm}
                        disabled={localSelected.size === 0}
                    >
                        Attach {localSelected.size > 0 ? `${localSelected.size} ${localSelected.size === 1 ? 'File' : 'Files'}` : 'Files'}
                    </Button>
                </div>
            }
        >
            <div className="mb-4">
                <p className="text-sm text-text-secondary">
                    Select files to limit your search scope
                </p>
            </div>

            <div className="overflow-y-auto pr-2 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin"></div>
                            <p className="text-sm text-text-muted">Loading files...</p>
                        </div>
                    </div>
                ) : data?.files && data.files.length > 0 ? (
                    <div className="space-y-3">
                        {data.files.map((file) => {
                            const config = fileTypeConfig[file.fileType];
                            const Icon = config.icon;
                            const isSelected = localSelected.has(file.id);

                            return (
                                <button
                                    key={file.id}
                                    onClick={() => toggleFile(file)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group",
                                        "border",
                                        isSelected
                                            ? "bg-accent-primary/10 border-accent-primary"
                                            : "bg-bg-tertiary/30 border-border-input hover:border-accent-primary/50"
                                    )}
                                >
                                    {/* Icon */}
                                    <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                        `bg-gradient-to-br ${config.bgGradient}`
                                    )}>
                                        <Icon className={cn("w-5 h-5", config.color)} />
                                    </div>

                                    {/* File Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-text-primary truncate">
                                            {file.originalFilename}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                                            <span className="uppercase">{file.fileType}</span>
                                            <span>•</span>
                                            <span>{formatFileSize(file.fileSize || 0)}</span>
                                        </div>
                                    </div>

                                    {/* Checkbox */}
                                    <div className="shrink-0">
                                        <div
                                            className={cn(
                                                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                                isSelected
                                                    ? "bg-accent-primary border-accent-primary"
                                                    : "border-border-input group-hover:border-accent-primary/50"
                                            )}
                                        >
                                            {isSelected && (
                                                <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                        <div className="w-14 h-14 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
                            <File size={28} className="text-text-muted opacity-50" />
                        </div>
                        <p className="text-sm text-text-secondary font-medium mb-1">No completed files</p>
                        <p className="text-xs text-text-muted">
                            Upload and process files to use in search
                        </p>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

export default FilePickerModal;

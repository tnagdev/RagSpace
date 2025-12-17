import { X, File, Image as ImageIcon, Video } from 'lucide-react';
import { FileResponseDto, FileType } from '@/types/upload.types';
import { cn } from '@/lib/utils';

interface FileAttachmentsProps {
    files: FileResponseDto[];
    onRemoveFile: (fileId: string) => void;
}

const FileAttachments: React.FC<FileAttachmentsProps> = ({ files, onRemoveFile }) => {
    if (files.length === 0) return null;

    const getFileIcon = (fileType: FileType) => {
        switch (fileType) {
            case FileType.VIDEO:
                return <Video size={16} />;
            case FileType.IMAGE:
                return <ImageIcon size={16} />;
            default:
                return <File size={16} />;
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <span>Attached Files ({files.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {files.map((file) => (
                    <div
                        key={file.id}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg",
                            "bg-[var(--color-bg-secondary)] border border-[var(--color-border-input)]",
                            "text-sm text-[var(--color-text-primary)]"
                        )}
                    >
                        <span className="text-[var(--color-accent-primary)]">
                            {getFileIcon(file.fileType)}
                        </span>
                        <span className="max-w-[150px] truncate">{file.originalFilename}</span>
                        <button
                            onClick={() => onRemoveFile(file.id)}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FileAttachments;

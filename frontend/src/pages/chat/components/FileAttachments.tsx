import { FileResponseDto } from '@/types/upload.types';
import { X, FileVideo, FileImage, File as FileIcon } from 'lucide-react';

interface FileAttachmentsProps {
    files: FileResponseDto[];
    onRemoveFile: (fileId: string) => void;
}

const FileAttachments: React.FC<FileAttachmentsProps> = ({ files, onRemoveFile }) => {
    const getFileIcon = (mimeType: string) => {
        if (mimeType.startsWith('video/')) return <FileVideo size={14} />;
        if (mimeType.startsWith('image/')) return <FileImage size={14} />;
        return <FileIcon size={14} />;
    };

    return (
        <div className="flex flex-wrap gap-2">
            {files.map((file) => (
                <div
                    key={file.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border 
                             rounded-lg text-sm group hover:border-accent-primary/50 transition-colors"
                >
                    <div className="text-text-secondary">{getFileIcon(file.mimeType)}</div>
                    <span className="text-white text-xs truncate max-w-37.5">{file.filename}</span>
                    <button
                        onClick={() => onRemoveFile(file.id)}
                        className="text-text-secondary hover:text-danger transition-colors"
                        title="Remove file"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default FileAttachments;

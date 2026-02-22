import { FileResponseDto } from '@/types/upload.types';
import { CollectionAttachment } from '@/types/collection.types';
import { X, FileVideo, FileImage, File as FileIcon, Folder } from 'lucide-react';

interface AttachmentsProps {
    files: FileResponseDto[];
    collections: CollectionAttachment[];
    onRemoveFile: (fileId: string) => void;
    onRemoveCollection: (collectionId: string) => void;
}

const Attachments: React.FC<AttachmentsProps> = ({ files, collections, onRemoveFile, onRemoveCollection }) => {
    const getFileIcon = (mimeType: string) => {
        if (mimeType.startsWith('video/')) return <FileVideo size={14} />;
        if (mimeType.startsWith('image/')) return <FileImage size={14} />;
        return <FileIcon size={14} />;
    };

    const hasAttachments = files.length > 0 || collections.length > 0;

    if (!hasAttachments) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-2">
            {/* Collection Attachments */}
            {collections.map((collection) => (
                <div
                    key={collection.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary border border-border 
                             rounded-lg text-sm group hover:border-accent-primary/50 transition-colors"
                >
                    <Folder
                        size={14}
                        style={{ color: collection.color || 'var(--color-accent-primary)' }}
                    />
                    <span className="text-white text-xs truncate max-w-37.5">{collection.name}</span>
                    <span className="text-text-muted text-xs">({collection.fileCount} files)</span>
                    <button
                        onClick={() => onRemoveCollection(collection.id)}
                        className="text-text-secondary hover:text-danger transition-colors"
                        title="Remove collection"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}

            {/* File Attachments */}
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

export default Attachments;

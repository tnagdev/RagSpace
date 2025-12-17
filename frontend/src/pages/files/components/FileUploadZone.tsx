import { useCallback, useRef, type FC } from 'react';
import { Upload } from 'lucide-react';
import Button from '../../../components/Button';

interface FileUploadZoneProps {
    onFilesSelected: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
}

export const FileUploadZone: FC<FileUploadZoneProps> = ({
    onFilesSelected,
    accept,
    multiple = true,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                onFilesSelected(files);
            }
        },
        [onFilesSelected]
    );

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
                onFilesSelected(files);
            }
            e.target.value = '';
        },
        [onFilesSelected]
    );

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative border-2 border-dashed border-sidebar-border rounded-xl p-8 text-center bg-bg-secondary/30 hover:bg-bg-secondary/50 hover:border-accent-primary transition-all cursor-pointer"
        >
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                    <Upload className="w-8 h-8 text-text-secondary" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-text-primary mb-1">
                        Drag or upload your files
                    </h3>
                    <p className="text-sm text-text-muted">
                        AI will automatically organize them into smart folders with context-aware tagging
                    </p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple={multiple}
                    accept={accept}
                    onChange={handleFileInput}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
        </div>
    );
};
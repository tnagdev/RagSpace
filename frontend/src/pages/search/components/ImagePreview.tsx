import { QueryResult } from '@/types/search.types';
import { Image as ImageIcon, FileText, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImagePreviewProps {
    result: QueryResult;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ result }) => {
    const fileDetails = result.file_details;

    const formatBytes = (bytes?: number) => {
        if (!bytes) return 'N/A';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Image Display */}
            <div className="relative bg-black flex items-center rounded-xl justify-center min-h-100 overflow-hidden">
                {fileDetails?.url ? (
                    <img
                        src={fileDetails.url}
                        alt={fileDetails.fileName}
                        className="max-w-full max-h-150 object-contain"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <ImageIcon size={48} />
                    </div>
                )}
            </div>

            {/* Metadata Section */}
            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <ImageIcon size={20} className="text-accent-primary" />
                    {fileDetails?.fileName || 'Unknown Image'}
                </h2>

                {/* Extracted Text */}
                {result.text && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                            <FileText size={14} />
                            Extracted Text
                        </h3>
                        <p className="text-sm text-text-secondary p-3 rounded-lg bg-bg-tertiary border border-border-input">
                            {result.text}
                        </p>
                    </div>
                )}

                {/* Match Scores */}
                <div className="mb-4 p-4 rounded-lg bg-bg-tertiary border border-border-input">
                    <h3 className="text-sm font-semibold text-text-primary mb-3">
                        Match Scores
                    </h3>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-muted">Overall Score</span>
                            <span className="text-sm font-semibold text-accent-primary">
                                {(result.score * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-muted">Text Match</span>
                            <span className="text-sm font-medium text-text-primary">
                                {(result.text_score * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-muted">Visual Match</span>
                            <span className="text-sm font-medium text-text-primary">
                                {(result.image_score * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-muted">Confidence</span>
                            <span className="text-sm font-medium text-text-primary">
                                {(result.confidence * 100).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* File Metadata */}
                {fileDetails && (
                    <div className="p-4 rounded-lg bg-bg-tertiary border border-border-input">
                        <h3 className="text-sm font-semibold text-text-primary mb-3">
                            File Information
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-text-muted">File Type</span>
                                <span className="text-text-primary font-medium">
                                    {fileDetails.fileType}
                                </span>
                            </div>
                            {fileDetails.mimeType && (
                                <div className="flex justify-between">
                                    <span className="text-text-muted">MIME Type</span>
                                    <span className="text-text-primary font-medium">
                                        {fileDetails.mimeType}
                                    </span>
                                </div>
                            )}
                            {fileDetails.fileSize && (
                                <div className="flex justify-between">
                                    <span className="text-text-muted">File Size</span>
                                    <span className="text-text-primary font-medium">
                                        {formatBytes(fileDetails.fileSize)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImagePreview;

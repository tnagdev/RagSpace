import { useEffect, useRef } from 'react';
import { QueryResult } from '@/types/search.types';
import { Clock, Film, FileText } from 'lucide-react';

interface VideoPreviewProps {
    result: QueryResult;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ result }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileDetails = result.file_details;
    const sceneDetails = result.scene_details;

    useEffect(() => {
        if (videoRef.current && sceneDetails?.startTime !== undefined) {
            videoRef.current.currentTime = sceneDetails.startTime;
        }
    }, [sceneDetails?.startTime, result.file_id]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatBytes = (bytes?: number) => {
        if (!bytes) return 'N/A';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Video Player */}
            <div className="relative bg-black aspect-video rounded-xl overflow-hidden">
                {fileDetails?.url ? (
                    <video
                        ref={videoRef}
                        src={fileDetails.url}
                        controls
                        className="w-full h-full"
                        controlsList="nodownload"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <Film size={48} />
                    </div>
                )}
            </div>

            {/* Metadata Section */}
            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Film size={20} className="text-accent-primary" />
                    {fileDetails?.fileName || 'Unknown File'}
                </h2>

                {/* Scene Details */}
                {sceneDetails && (
                    <div className="mb-4 p-4 rounded-lg bg-bg-tertiary border border-border-input">
                        <h3 className="text-sm font-semibold text-text-primary mb-3">
                            Scene {sceneDetails.sceneNumber}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <span className="text-text-muted">Start Time</span>
                                <div className="text-text-primary font-medium flex items-center gap-1">
                                    <Clock size={14} />
                                    {formatTime(sceneDetails.startTime)}
                                </div>
                            </div>
                            <div>
                                <span className="text-text-muted">End Time</span>
                                <div className="text-text-primary font-medium flex items-center gap-1">
                                    <Clock size={14} />
                                    {formatTime(sceneDetails.endTime)}
                                </div>
                            </div>
                            <div>
                                <span className="text-text-muted">Duration</span>
                                <div className="text-text-primary font-medium">
                                    {sceneDetails.duration.toFixed(2)}s
                                </div>
                            </div>
                            <div>
                                <span className="text-text-muted">Frames</span>
                                <div className="text-text-primary font-medium">
                                    {sceneDetails.startFrame} - {sceneDetails.endFrame}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transcription/Text */}
                {result.text && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                            <FileText size={14} />
                            Transcription
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

export default VideoPreview;

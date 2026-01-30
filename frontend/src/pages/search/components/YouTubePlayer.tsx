import { useRef } from 'react';
import { QueryResult } from '@/types/search.types';
import { SearchResult } from '@/types/chat.types';
import { Clock, Youtube, FileText } from 'lucide-react';

interface YouTubePlayerProps {
    result: QueryResult | SearchResult;
    youtubeUrl: string;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ result, youtubeUrl }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    
    // Extract video ID from YouTube URL
    const getYouTubeVideoId = (url: string): string | null => {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/shorts\/([^&\n?#]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const videoId = getYouTubeVideoId(youtubeUrl);
    
    // Get start time from result
    const startTime = 'scene_details' in result 
        ? result.scene_details?.startTime 
        : result.start_time;
    
    // Build YouTube embed URL with timestamp
    const embedUrl = videoId 
        ? `https://www.youtube.com/embed/${videoId}${startTime ? `?start=${Math.floor(startTime)}` : ''}` 
        : null;

    const sceneDetails = 'scene_details' in result ? result.scene_details : undefined;
    const fileName = 'file_details' in result ? result.file_details?.fileName : result.file_name;

    return (
        <div className="flex flex-col gap-4">
            {/* YouTube Player */}
            <div className="relative bg-black aspect-video rounded-xl overflow-hidden">
                {embedUrl ? (
                    <iframe
                        ref={iframeRef}
                        src={embedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube video player"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <Youtube size={48} />
                    </div>
                )}
            </div>

            {/* Metadata Section */}
            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Youtube size={20} className="text-red-500" />
                    {fileName || 'Unknown Video'}
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
                {'text' in result && result.text && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                            <FileText size={14} />
                            Transcription
                        </h3>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {result.text}
                        </p>
                    </div>
                )}

                {'text_content' in result && result.text_content && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                            <FileText size={14} />
                            Transcription
                        </h3>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {result.text_content}
                        </p>
                    </div>
                )}

                {/* YouTube URL */}
                <div className="pt-4 border-t border-border-input">
                    <a 
                        href={youtubeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-accent-primary hover:text-accent-secondary transition-colors flex items-center gap-1"
                    >
                        <Youtube size={12} />
                        Watch on YouTube
                    </a>
                </div>
            </div>
        </div>
    );
};

export default YouTubePlayer;

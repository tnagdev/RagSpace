import { useEffect, useMemo, useRef } from 'react';
import { Youtube } from 'lucide-react';
import type { SearchHit } from '@/api/types';
import { HitDetails } from './HitDetails';

interface YouTubePlayerProps {
    result: SearchHit;
    youtubeUrl: string;
}

const VIDEO_ID_PATTERNS = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
];

function youTubeVideoId(url: string): string | null {
    for (const pattern of VIDEO_ID_PATTERNS) {
        const match = url.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ result, youtubeUrl }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const videoId = youTubeVideoId(youtubeUrl);
    const startTime = result.startSeconds;

    // Keyed to the video only, so seeking within it does not reload the iframe; seeks go through postMessage below.
    const embedUrl = useMemo(() => {
        if (!videoId) return null;
        const start = startTime !== null ? `&start=${Math.floor(startTime)}` : '';
        return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1${start}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    useEffect(() => {
        const win = iframeRef.current?.contentWindow;
        if (startTime === null || !win) return;
        win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [startTime, true] }), '*');
        win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    }, [startTime]);

    return (
        <div className="flex flex-col gap-4">
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

            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Youtube size={20} className="text-danger" />
                    {result.fileName || 'Unknown Video'}
                </h2>
                <HitDetails hit={result} snippetLabel="Transcript" />
                <div className="pt-4 mt-4 border-t border-border-input">
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

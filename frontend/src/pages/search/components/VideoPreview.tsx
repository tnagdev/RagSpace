import { useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import type { SearchHit } from '@/api/types';
import { HitDetails } from './HitDetails';

const VideoPreview: React.FC<{ result: SearchHit }> = ({ result }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && result.startSeconds !== null) {
            videoRef.current.currentTime = result.startSeconds;
        }
    }, [result.startSeconds, result.fileId]);

    return (
        <div className="flex flex-col gap-4">
            <div className="relative bg-black aspect-video rounded-xl overflow-hidden">
                {result.fileUrl ? (
                    <video ref={videoRef} src={result.fileUrl} controls className="w-full h-full" controlsList="nodownload" />
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <Film size={48} />
                    </div>
                )}
            </div>

            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Film size={20} className="text-accent-primary" />
                    {result.fileName || 'Unknown File'}
                </h2>
                <HitDetails hit={result} snippetLabel="Transcript" />
            </div>
        </div>
    );
};

export default VideoPreview;

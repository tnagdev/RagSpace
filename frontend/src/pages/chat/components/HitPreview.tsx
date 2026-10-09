import type { SearchHit } from '@/api/types';
import ImagePreview from '../../search/components/ImagePreview';
import VideoPreview from '../../search/components/VideoPreview';
import YouTubePlayer from '../../search/components/YouTubePlayer';

const HitPreview: React.FC<{ hit: SearchHit }> = ({ hit }) => {
    if (hit.youtubeUrl) return <YouTubePlayer result={hit} youtubeUrl={hit.youtubeUrl} />;
    if (hit.fileType === 'IMAGE') return <ImagePreview result={hit} />;
    return <VideoPreview result={hit} />;
};

// Picks the hit to open for a timestamp cited in a reply: one covering that moment, else any playable hit.
export function hitAtTimestamp(pool: SearchHit[], seconds: number): SearchHit | undefined {
    const match =
        pool.find((h) => h.startSeconds !== null && h.startSeconds <= seconds && (h.endSeconds ?? Infinity) >= seconds) ??
        pool.find((h) => h.fileUrl || h.youtubeUrl) ??
        pool[0];
    return match ? { ...match, startSeconds: seconds } : undefined;
}

export default HitPreview;

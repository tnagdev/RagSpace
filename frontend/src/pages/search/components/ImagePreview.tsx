import { Image as ImageIcon } from 'lucide-react';
import type { SearchHit } from '@/api/types';
import { HitDetails } from './HitDetails';

const ImagePreview: React.FC<{ result: SearchHit }> = ({ result }) => {
    const src = result.fileUrl ?? result.thumbnailUrl;
    return (
        <div className="flex flex-col gap-4">
            <div className="relative bg-black flex items-center rounded-xl justify-center min-h-100 overflow-hidden">
                {src ? (
                    <img src={src} alt={result.fileName} className="max-w-full max-h-150 object-contain" />
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <ImageIcon size={48} />
                    </div>
                )}
            </div>

            <div className="p-6 bg-bg-secondary rounded-xl">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <ImageIcon size={20} className="text-accent-primary" />
                    {result.fileName || 'Unknown Image'}
                </h2>
                <HitDetails hit={result} snippetLabel="Text in image" />
            </div>
        </div>
    );
};

export default ImagePreview;

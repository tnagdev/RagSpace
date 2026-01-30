import { useState, useCallback, type FC } from 'react';
import { Youtube, AlertCircle } from 'lucide-react';
import Button from '../../../components/Button';

interface YouTubeLinkInputProps {
    onSubmit: (url: string) => void;
    isSubmitting?: boolean;
}

const YOUTUBE_URL_PATTERNS = [
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+(&.*)?$/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+(\?.*)?$/,
    /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+(\?.*)?$/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+(\?.*)?$/,
];

const extractVideoId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
};

export const YouTubeLinkInput: FC<YouTubeLinkInputProps> = ({
    onSubmit,
    isSubmitting = false,
}) => {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    const validateYouTubeUrl = useCallback((value: string): boolean => {
        if (!value.trim()) {
            setError('');
            return false;
        }

        const isValid = YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(value));
        if (!isValid) {
            setError('Invalid YouTube URL. Please enter a valid YouTube video link.');
            return false;
        }

        setError('');
        return true;
    }, []);

    const handleUrlChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setUrl(value);
            if (value.trim()) {
                validateYouTubeUrl(value);
            } else {
                setError('');
            }
        },
        [validateYouTubeUrl]
    );

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();

            if (!url.trim()) {
                setError('Please enter a YouTube URL');
                return;
            }

            if (!validateYouTubeUrl(url)) {
                return;
            }

            const videoId = extractVideoId(url);
            if (!videoId) {
                setError('Could not extract video ID from URL');
                return;
            }

            onSubmit(url.trim());
            setUrl('');
            setError('');
        },
        [url, validateYouTubeUrl, onSubmit]
    );

    return (
        <div className="border-2 border-dashed border-sidebar-border rounded-xl p-8 bg-bg-secondary/30">
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                    <Youtube className="w-8 h-8 text-red-500" />
                </div>
                <div className="text-center">
                    <h3 className="text-base font-semibold text-text-primary mb-1">
                        Process YouTube Video
                    </h3>
                    <p className="text-sm text-text-muted">
                        Paste a YouTube link to analyze and search through the video
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="w-full space-y-3">
                    <div className="relative">
                        <input
                            type="text"
                            value={url}
                            onChange={handleUrlChange}
                            placeholder="https://www.youtube.com/watch?v=..."
                            disabled={isSubmitting}
                            className={`w-full px-4 py-2.5 bg-bg-tertiary border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all ${error
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-sidebar-border'
                                } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {error && (
                            <div className="flex items-start gap-2 mt-2 text-red-500 text-xs">
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={!url.trim() || !!error || isSubmitting}
                        className="w-full"
                    >
                        {isSubmitting ? 'Processing...' : 'Process Video'}
                    </Button>
                </form>

                <div className="text-xs text-text-muted text-center">
                    Supported: youtube.com/watch, youtu.be, youtube.com/shorts
                </div>
            </div>
        </div>
    );
};

import { Play } from 'lucide-react';

interface TimestampBadgeProps {
    seconds: number;
    endSeconds?: number;
    thumbnailUrl?: string;
    onClick: (seconds: number) => void;
}

const fmt = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
};

const TimestampBadge: React.FC<TimestampBadgeProps> = ({ seconds, endSeconds, thumbnailUrl, onClick }) => (
    <button
        onClick={() => onClick(seconds)}
        title={`Seek to ${fmt(seconds)}`}
        className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full align-middle mx-0.5
                   border border-accent-primary/30 hover:border-accent-primary/60
                   bg-bg-secondary hover:bg-accent-primary/10
                   cursor-pointer transition-all duration-150 group"
    >
        {/* Circular thumbnail */}
        <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden bg-bg-tertiary">
            {thumbnailUrl ? (
                <>
                    <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 rounded-full bg-black/40 group-hover:bg-black/10
                                    transition-colors duration-150 flex items-center justify-center">
                        <Play size={5} fill="white" className="text-white" />
                    </div>
                </>
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <Play size={7} fill="currentColor" className="text-accent-primary" />
                </div>
            )}
        </div>

        {/* Time label */}
        <span className="text-[10px] font-mono font-medium text-accent-primary leading-none">
            {fmt(seconds)}
            {endSeconds !== undefined && (
                <span className="text-text-secondary"> – {fmt(endSeconds)}</span>
            )}
        </span>
    </button>
);

export default TimestampBadge;

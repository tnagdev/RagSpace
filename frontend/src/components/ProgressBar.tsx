import { type FC } from 'react';

interface ProgressBarProps {
    progress: number;
    variant?: 'default' | 'shimmer';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    showPercentage?: boolean;
}

const sizeClasses = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2',
};

export const ProgressBar: FC<ProgressBarProps> = ({
    progress,
    variant = 'default',
    size = 'md',
    className = '',
    showPercentage = false,
}) => {
    const heightClass = sizeClasses[size];

    return (
        <div className={`w-full ${className}`}>
            <div className={`w-full bg-bg-secondary rounded-full ${heightClass} overflow-hidden`}>
                {variant === 'default' ? (
                    <div
                        className={`${heightClass} rounded-full transition-all duration-300`}
                        style={{
                            width: `${progress}%`,
                            background: 'linear-gradient(to right, var(--gradient-primary-start), var(--gradient-primary-end))',
                        }}
                    />
                ) : (
                    <div
                        className={`${heightClass} w-full relative overflow-hidden`}
                        style={{
                            background: 'linear-gradient(to right, var(--gradient-primary-start), var(--gradient-primary-end))',
                        }}
                    >
                        <div
                            className="absolute inset-0 w-1/3"
                            style={{
                                animation: 'shimmer 1.5s ease-in-out infinite',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                            }}
                        />
                    </div>
                )}
            </div>
            {showPercentage && variant === 'default' && (
                <p className="text-xs text-text-muted mt-1">{progress}%</p>
            )}
        </div>
    );
};

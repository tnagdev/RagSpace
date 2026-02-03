import { type FC } from 'react';

interface LoaderProps {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
    fullScreen?: boolean;
}

const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
};

export const Loader: FC<LoaderProps> = ({
    size = 'md',
    message,
    fullScreen = false
}) => {
    const containerClass = fullScreen
        ? 'fixed inset-0 flex items-center justify-center bg-background-primary/90 backdrop-blur-md z-50'
        : 'flex items-center justify-center h-full';

    return (
        <div className={containerClass}>
            <div className="flex flex-col items-center">
                <div className="flex gap-1">
                    {[0, 0.15, 0.3].map((delay, i) => (
                        <div
                            key={i}
                            className={`${size === 'sm' ? 'w-2 h-7' : size === 'md' ? 'w-3 h-10' : 'w-4 h-14'} bg-accent-primary rounded-sm`}
                            style={{
                                animation: 'frame-scan 1.2s ease-in-out infinite',
                                animationDelay: `${delay}s`,
                                opacity: 0.3,
                            }}
                        />
                    ))}
                </div>

                {message && (
                    <p className="mt-4 text-sm text-text-secondary">
                        {message}
                    </p>
                )}
            </div>

            <style jsx>{`
                @keyframes frame-scan {
                    0%, 100% {
                        opacity: 0.3;
                        transform: scaleY(0.7);
                    }
                    50% {
                        opacity: 1;
                        transform: scaleY(1);
                    }
                }
            `}</style>
        </div>
    );
};

// Simple inline spinner for buttons and small spaces
export const Spinner: FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
    size = 'md',
    className = ''
}) => {
    const spinnerHeight = size === 'sm' ? 'h-5' : size === 'md' ? 'h-6' : 'h-8';
    const barWidth = size === 'sm' ? 'w-1' : size === 'md' ? 'w-1.5' : 'w-2';

    return (
        <div className={`inline-flex items-center gap-0.5 ${className}`}>
            {[0, 0.1, 0.2].map((delay, i) => (
                <div
                    key={i}
                    className={`${barWidth} ${spinnerHeight} bg-accent-primary rounded-full`}
                    style={{
                        animation: 'bar-bounce 1s ease-in-out infinite',
                        animationDelay: `${delay}s`,
                    }}
                />
            ))}

            <style jsx>{`
                @keyframes bar-bounce {
                    0%, 100% {
                        transform: scaleY(0.4);
                        opacity: 0.5;
                    }
                    50% {
                        transform: scaleY(1);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
};

export default Loader;

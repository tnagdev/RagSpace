import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
    children: React.ReactNode;
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
    className?: string;
    disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
    children,
    content,
    position = 'top',
    delay = 200,
    className = '',
    disabled = false,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const showTooltip = () => {
        if (disabled) return;
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
            calculatePosition();
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
    };

    const calculatePosition = () => {
        if (!containerRef.current || !tooltipRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        let top = 0;
        let left = 0;

        switch (position) {
            case 'top':
                top = -tooltipRect.height - 8;
                left = (containerRect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top = containerRect.height + 8;
                left = (containerRect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                top = (containerRect.height - tooltipRect.height) / 2;
                left = -tooltipRect.width - 8;
                break;
            case 'right':
                top = (containerRect.height - tooltipRect.height) / 2;
                left = containerRect.width + 8;
                break;
        }

        setTooltipPosition({ top, left });
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (isVisible) {
            calculatePosition();
        }
    }, [isVisible]);

    return (
        <div
            ref={containerRef}
            className={`relative inline-block ${className}`}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
        >
            {children}
            {isVisible && (
                <div
                    ref={tooltipRef}
                    className="absolute z-50 pointer-events-none"
                    style={{
                        top: `${tooltipPosition.top}px`,
                        left: `${tooltipPosition.left}px`,
                    }}
                >
                    <div className="bg-primary text-white text-sm px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
                        {content}
                        <div
                            className={`absolute w-2 h-2 bg-primary transform rotate-45 ${position === 'top'
                                ? '-bottom-1 left-1/2 -translate-x-1/2'
                                : position === 'bottom'
                                    ? '-top-1 left-1/2 -translate-x-1/2'
                                    : position === 'left'
                                        ? '-right-1 top-1/2 -translate-y-1/2'
                                        : '-left-1 top-1/2 -translate-y-1/2'
                                }`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tooltip;

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
    isOpen: boolean;
    onClose: () => void;
    trigger: HTMLElement | null;
    children: ReactNode;
    className?: string;
}

type Position = 'top' | 'bottom' | 'left' | 'right';
type Alignment = 'start' | 'center' | 'end';

const Popover: React.FC<PopoverProps> = ({ isOpen, onClose, trigger, children, className = '' }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<Position>('bottom');
    const [alignment, setAlignment] = useState<Alignment>('start');
    const [coordinates, setCoordinates] = useState({ top: 0, left: 0 });
    const [isPositioned, setIsPositioned] = useState(false);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(event.target as Node) &&
                trigger &&
                !trigger.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose, trigger]);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Calculate position
    useEffect(() => {
        if (!isOpen || !trigger || !popoverRef.current) {
            setIsPositioned(false);
            return;
        }

        const calculatePosition = () => {
            if (!trigger || !popoverRef.current) return;

            const triggerRect = trigger.getBoundingClientRect();
            const popoverRect = popoverRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const gap = 8; // Gap between trigger and popover

            // Calculate available space in each direction
            const spaceAbove = triggerRect.top;
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceLeft = triggerRect.left;
            const spaceRight = viewportWidth - triggerRect.right;

            const popoverWidth = popoverRect.width || 200;
            const popoverHeight = popoverRect.height || 150;

            let finalPosition: Position = 'bottom';
            let finalAlignment: Alignment = 'start';
            let top = 0;
            let left = 0;

            // Determine primary position (vertical preference)
            if (spaceBelow >= popoverHeight + gap) {
                finalPosition = 'bottom';
                top = triggerRect.bottom + gap;
            } else if (spaceAbove >= popoverHeight + gap) {
                finalPosition = 'top';
                top = triggerRect.top - popoverHeight - gap;
            } else if (spaceRight >= popoverWidth + gap) {
                finalPosition = 'right';
                top = triggerRect.top;
                left = triggerRect.right + gap;
            } else if (spaceLeft >= popoverWidth + gap) {
                finalPosition = 'left';
                top = triggerRect.top;
                left = triggerRect.left - popoverWidth - gap;
            } else {
                // Fallback: position below even if not enough space
                finalPosition = 'bottom';
                top = triggerRect.bottom + gap;
            }

            // Determine horizontal alignment for top/bottom positions
            if (finalPosition === 'top' || finalPosition === 'bottom') {
                // Try to align start (left edge)
                left = triggerRect.left;

                // Check if it fits
                if (left + popoverWidth > viewportWidth) {
                    // Align end (right edge)
                    left = triggerRect.right - popoverWidth;
                    finalAlignment = 'end';

                    // If still doesn't fit, center it
                    if (left < 0) {
                        left = triggerRect.left + (triggerRect.width - popoverWidth) / 2;
                        finalAlignment = 'center';
                    }
                } else {
                    finalAlignment = 'start';
                }

                // Ensure it stays within viewport
                left = Math.max(8, Math.min(left, viewportWidth - popoverWidth - 8));
            }

            // Determine vertical alignment for left/right positions
            if (finalPosition === 'left' || finalPosition === 'right') {
                // Try to align with trigger top
                if (top + popoverHeight > viewportHeight) {
                    // Align bottom
                    top = triggerRect.bottom - popoverHeight;
                    finalAlignment = 'end';

                    // If still doesn't fit, center it
                    if (top < 0) {
                        top = triggerRect.top + (triggerRect.height - popoverHeight) / 2;
                        finalAlignment = 'center';
                    }
                } else {
                    finalAlignment = 'start';
                }

                // Ensure it stays within viewport
                top = Math.max(8, Math.min(top, viewportHeight - popoverHeight - 8));
            }

            setPosition(finalPosition);
            setAlignment(finalAlignment);
            setCoordinates({ top, left });
            setIsPositioned(true);
        };

        // Calculate on next frame to ensure popover is rendered
        requestAnimationFrame(calculatePosition);

        // Recalculate on scroll and resize
        window.addEventListener('scroll', calculatePosition, true);
        window.addEventListener('resize', calculatePosition);

        return () => {
            window.removeEventListener('scroll', calculatePosition, true);
            window.removeEventListener('resize', calculatePosition);
        };
    }, [isOpen, trigger]);

    if (!isOpen) return null;

    const popoverContent = (
        <div
            ref={popoverRef}
            className={`fixed z-50 bg-bg-secondary border border-sidebar-border rounded-lg shadow-xl transition-opacity duration-150 ${isPositioned ? 'opacity-100' : 'opacity-0'
                } ${className}`}
            style={{
                top: `${coordinates.top}px`,
                left: `${coordinates.left}px`,
            }}
        >
            {children}
        </div>
    );

    return createPortal(popoverContent, document.body);
};

export default Popover;

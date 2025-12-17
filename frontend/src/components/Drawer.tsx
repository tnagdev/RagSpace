import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: () => void;
    onCancel?: () => void;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    submitText?: string;
    cancelText?: string;
    showFooter?: boolean;
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    position?: 'left' | 'right';
    width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    className?: string;
    overlayClassName?: string;
    contentClassName?: string;
    footerClassName?: string;
    zIndex?: number;
    backdropEnabled?: boolean;
    showHeader?: boolean;
}

const widthClasses = {
    sm: 'w-80',
    md: 'w-96',
    lg: 'w-[32rem]',
    xl: 'w-[40rem]',
    full: 'w-full',
};

export const Drawer: React.FC<DrawerProps> = ({
    isOpen,
    onClose,
    onSubmit,
    onCancel,
    title,
    children,
    submitText = 'Submit',
    cancelText = 'Cancel',
    showFooter = true,
    footer,
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    position = 'right',
    width = 'md',
    className,
    overlayClassName,
    contentClassName,
    footerClassName,
    zIndex = 1000,
    backdropEnabled = true,
    showHeader = true,
}) => {
    const drawerRef = useRef<HTMLDivElement>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [shouldRender, setShouldRender] = useState(isOpen);
    const prevOpenRef = useRef(isOpen);

    useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            // Opening
            setShouldRender(true);
            setIsClosing(false);
        } else if (!isOpen && prevOpenRef.current && !isClosing) {
            // Closing from parent - trigger animation
            setIsClosing(true);
            setTimeout(() => {
                setShouldRender(false);
                setIsClosing(false);
            }, 300);
        }
        prevOpenRef.current = isOpen;
    }, [isOpen, isClosing]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscape && isOpen && !isClosing) {
                handleClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, closeOnEscape, isClosing]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setShouldRender(false);
            setIsClosing(false);
        }, 300); // Match animation duration
    };

    const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (closeOnOverlayClick && event.target === event.currentTarget && !isClosing) {
            handleClose();
        }
    };

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        }
        handleClose();
    };

    const handleSubmit = () => {
        if (onSubmit) {
            onSubmit();
        }
    };

    if (!shouldRender) return null;

    const positionClasses = position === 'right' ? 'right-0' : 'left-0';
    const slideAnimation = isClosing
        ? (position === 'right' ? 'animate-slide-out-right' : 'animate-slide-out-left')
        : (position === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left');
    const backdropAnimation = isClosing ? 'animate-fade-out' : 'animate-fade-in';

    const drawerContent = (
        <div
            className={twMerge(
                'fixed inset-0',
                overlayClassName
            )}
            style={{ zIndex }}
            onClick={handleOverlayClick}
        >
            {/* Backdrop */}
            {backdropEnabled && (
                <div className={twMerge('absolute inset-0 bg-black/50', backdropAnimation)} />
            )}

            {/* Drawer */}
            <div
                ref={drawerRef}
                className={twMerge(
                    'absolute top-0 bottom-0 shadow-xl flex flex-col',
                    positionClasses,
                    widthClasses[width],
                    slideAnimation,
                    className
                )}
                style={{ zIndex: zIndex + 1 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {(showHeader && (title || showCloseButton)) && (
                    <div className="flex items-center justify-between p-6 shrink-0">
                        {title && <h2 className="text-xl font-semibold">{title}</h2>}
                        {showCloseButton && (
                            <button
                                onClick={handleClose}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                aria-label="Close drawer"
                            >
                                <X size={24} />
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className={twMerge('flex-1 overflow-y-auto p-6', contentClassName)}>
                    {children}
                </div>

                {/* Footer */}
                {/* {showFooter && (
                    <div className={twMerge(
                        'flex items-center justify-end gap-3 p-6 border-t border-gray-200 shrink-0',
                        footerClassName
                    )}>
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            {cancelText}
                        </button>
                        {onSubmit && (
                            <button
                                onClick={handleSubmit}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md hover:bg-primary/90 transition-colors"
                            >
                                {submitText}
                            </button>
                        )}
                    </div>
                )} */}
                {/* Footer */}
                {showFooter && (
                    footer ? (
                        footer
                    ) : (
                        <div
                            className={twMerge(
                                "flex items-center justify-end gap-3 p-6 border-t border-gray-200 shrink-0",
                                footerClassName
                            )}
                        >
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                                {cancelText}
                            </button>

                            {onSubmit && (
                                <button
                                    onClick={handleSubmit}
                                    className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md hover:bg-primary/90 transition-colors"
                                >
                                    {submitText}
                                </button>
                            )}
                        </div>
                    )
                )}

            </div>
        </div>
    );

    return createPortal(drawerContent, document.body);
};

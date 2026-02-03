import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: () => void;
    onCancel?: () => void;
    title?: string;
    children: React.ReactNode;
    submitText?: string;
    cancelText?: string;
    showFooter?: boolean;
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    className?: string;
    overlayClassName?: string;
    contentClassName?: string;
    footerClassName?: string;
    zIndex?: number;
    backdropEnabled?: boolean;
    showHeader?: boolean;
    portal?: boolean;
}

const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
};

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    onCancel,
    title,
    children,
    submitText = 'Submit',
    cancelText = 'Cancel',
    showFooter = true,
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    size = 'md',
    className,
    overlayClassName,
    contentClassName,
    footerClassName,
    zIndex = 1000,
    backdropEnabled = true,
    showHeader = true,
    portal = true,
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscape && isOpen) {
                onClose();
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
    }, [isOpen, closeOnEscape, onClose]);

    const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
            onClose();
        }
    };

    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        } else {
            onClose();
        }
    };

    const handleSubmit = () => {
        if (onSubmit) {
            onSubmit();
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div
            className={twMerge(
                portal ? 'fixed inset-0' : 'absolute inset-0',
                'flex items-center justify-center p-4',
                overlayClassName
            )}
            style={{ zIndex }}
            onClick={handleOverlayClick}
        >
            {/* Backdrop */}
            {backdropEnabled && <div className="absolute inset-0 bg-black/60 transition-opacity" />}

            {/* Modal */}
            <div
                ref={modalRef}
                className={twMerge(
                    'relative bg-bg-primary rounded-2xl shadow-xl w-full transform transition-all',
                    sizeClasses[size],
                    className
                )}
                style={{ zIndex: zIndex + 1 }}
            >
                {/* Header */}
                {(showHeader && (title || showCloseButton)) && (
                    <div className="flex items-center justify-between px-6 pt-6 pb-4">
                        {title && <h2 className="text-xl font-semibold text-text-primary">{title}</h2>}
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="text-text-muted hover:text-text-primary transition-colors"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className={twMerge('px-6 pb-6', contentClassName)}>
                    {children}
                </div>

                {/* Footer */}
                {showFooter && (
                    <div className={twMerge(
                        'flex items-center justify-end gap-3 px-6 pb-6',
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
                )}
            </div>
        </div>
    );

    return portal ? createPortal(modalContent, document.body) : modalContent;
};

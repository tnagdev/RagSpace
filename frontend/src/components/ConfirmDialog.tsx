import React from 'react';
import { Modal } from '@/components/Modal';
import Button from '@/components/Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    isLoading = false,
}) => {
    const handleConfirm = () => {
        onConfirm();
    };

    const variantStyles = {
        danger: {
            iconColor: 'text-red-500',
            bgColor: 'bg-red-500/8',
            buttonVariant: 'danger' as const,
        },
        warning: {
            iconColor: 'text-status-warning',
            bgColor: 'bg-status-warning/8',
            buttonVariant: 'primary' as const,
        },
        info: {
            iconColor: 'text-blue-500',
            bgColor: 'bg-blue-500/8',
            buttonVariant: 'primary' as const,
        },
    };

    const styles = variantStyles[variant];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="md"
            showFooter={false}
        >
            <div className="space-y-5">
                {/* Warning banner */}
                <div className={`flex gap-3.5 p-4 rounded-lg ${styles.bgColor}`}>
                    <AlertTriangle
                        className={`shrink-0 ${styles.iconColor} mt-1`}
                        size={24}
                    />
                    <div className="flex-1">
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {message}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-3 pt-1">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={styles.buttonVariant}
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

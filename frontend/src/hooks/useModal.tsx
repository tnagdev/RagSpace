import { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, type ModalProps } from '@/components/Modal';

interface UseModalOptions extends Partial<Omit<ModalProps, 'isOpen' | 'onClose' | 'children'>> {
    onOpen?: () => void;
    onClose?: () => void;
}

interface UseModalReturn {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    Modal: React.FC<Omit<ModalProps, 'isOpen' | 'onClose' | 'zIndex'>>;
}

let modalCount = 0;

export const useModal = (options: UseModalOptions = {}): UseModalReturn => {
    const [isOpen, setIsOpen] = useState(false);
    const zIndexRef = useRef(1000);
    const modalIdRef = useRef(0);

    useEffect(() => {
        if (isOpen) {
            modalIdRef.current = ++modalCount;
            zIndexRef.current = 1000 + (modalIdRef.current * 10);
        } else {
            if (modalIdRef.current > 0) {
                modalCount--;
                modalIdRef.current = 0;
            }
        }
    }, [isOpen]);

    const open = useCallback(() => {
        setIsOpen(true);
        options.onOpen?.();
    }, [options]);

    const close = useCallback(() => {
        setIsOpen(false);
        options.onClose?.();
    }, [options]);

    const toggle = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const ModalComponent: React.FC<Omit<ModalProps, 'isOpen' | 'onClose' | 'zIndex'>> = useCallback(
        (props) => {
            return (
                <Modal
                    {...options}
                    {...props}
                    isOpen={isOpen}
                    onClose={close}
                    zIndex={zIndexRef.current}
                />
            );
        },
        [isOpen, close, options]
    );

    return {
        isOpen,
        open,
        close,
        toggle,
        Modal: ModalComponent,
    };
};

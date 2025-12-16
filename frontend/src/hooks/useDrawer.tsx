import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Drawer, type DrawerProps } from '@/components/Drawer';

interface UseDrawerOptions extends Partial<Omit<DrawerProps, 'isOpen' | 'onClose' | 'children'>> {
    onOpen?: () => void;
    onClose?: () => void;
}

interface UseDrawerReturn {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    Drawer: React.FC<Omit<DrawerProps, 'isOpen' | 'onClose' | 'zIndex'>>;
}

// Global z-index counter that always increments
let globalZIndexCounter = 1000;
const BASE_Z_INDEX = 1000;

export const useDrawer = (options: UseDrawerOptions = {}): UseDrawerReturn => {
    const [isOpen, setIsOpen] = useState(false);
    const [zIndex, setZIndex] = useState(BASE_Z_INDEX);
    const optionsRef = useRef(options);

    // Update options ref when options change
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    useEffect(() => {
        if (isOpen) {
            // Assign a new z-index every time the drawer opens
            globalZIndexCounter += 10;
            setZIndex(globalZIndexCounter);
        }
    }, [isOpen]);

    const open = useCallback(() => {
        setIsOpen(true);
        optionsRef.current.onOpen?.();
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        optionsRef.current.onClose?.();
    }, []);

    const toggle = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const DrawerComponent: React.FC<Omit<DrawerProps, 'isOpen' | 'onClose' | 'zIndex'>> = useMemo(
        () => (props) => {
            return (
                <Drawer
                    {...optionsRef.current}
                    {...props}
                    isOpen={isOpen}
                    onClose={close}
                    zIndex={zIndex}
                />
            );
        },
        [isOpen, close, zIndex]
    );

    return {
        isOpen,
        open,
        close,
        toggle,
        Drawer: DrawerComponent,
    };
};

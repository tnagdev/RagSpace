import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setUsageErrorHandler } from '@/api/apiClient';
import type { UsageErrorData } from '@/types/payment.types';

interface PlansModalContextType {
    isOpen: boolean;
    openPlansModal: (reason?: string) => void;
    closePlansModal: () => void;
    reason?: string;
}

const PlansModalContext = createContext<PlansModalContextType | undefined>(undefined);

export const usePlansModal = () => {
    const context = useContext(PlansModalContext);
    if (!context) {
        throw new Error('usePlansModal must be used within PlansModalProvider');
    }
    return context;
};

export const PlansModalProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [reason, setReason] = useState<string>();

    const openPlansModal = (modalReason?: string) => {
        setReason(modalReason);
        setIsOpen(true);
    };

    const closePlansModal = () => {
        setIsOpen(false);
        setReason(undefined);
    };

    // Set up usage error handler on mount
    useEffect(() => {
        const handleUsageError = (errorData: UsageErrorData) => {
            const message = errorData.message || 'You have reached your plan limit. Please upgrade to continue.';
            openPlansModal(message);
        };

        setUsageErrorHandler(handleUsageError);

        return () => {
            setUsageErrorHandler(() => { });
        };
    }, []);

    return (
        <PlansModalContext.Provider
            value={{ isOpen, openPlansModal, closePlansModal, reason }}
        >
            {children}
        </PlansModalContext.Provider>
    );
};

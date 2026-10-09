import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onQuotaExceeded } from '@/api/client';

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

    // Any 402 from the API means a plan limit was hit; offer an upgrade.
    useEffect(
        () =>
            onQuotaExceeded((problem) =>
                openPlansModal(problem.detail ?? 'You have reached your plan limit. Please upgrade to continue.'),
            ),
        [],
    );

    return (
        <PlansModalContext.Provider value={{ isOpen, openPlansModal, closePlansModal, reason }}>
            {children}
        </PlansModalContext.Provider>
    );
};

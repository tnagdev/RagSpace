import { useState, useRef } from 'react';
import { useCurrentUser } from "@/hooks/auth";
import { clearAuthData } from "@/api/auth";
import { privateAxios } from "@/api/apiClient";
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import Popover from './Popover';

export function UserProfile() {
    const { data: user, isLoading } = useCurrentUser();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const handleLogout = () => {
        clearAuthData();
        privateAxios.defaults.headers.common.Authorization = '';
        navigate({ to: '/auth/login' });
    };

    if (isLoading) {
        return (
            <div className="animate-pulse flex items-center gap-3">
                <div className="h-9 w-9 bg-[var(--color-sidebar-hover)] rounded-full"></div>
                <div className="space-y-1">
                    <div className="h-3 bg-[var(--color-sidebar-hover)] rounded w-20"></div>
                    <div className="h-2 bg-[var(--color-sidebar-hover)] rounded w-16"></div>
                </div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 hover:bg-[var(--color-sidebar-hover)] rounded-lg px-3 py-2 transition-colors group"
            >
                <div className="flex-shrink-0">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--gradient-primary-start)] to-[var(--gradient-primary-end)] flex items-center justify-center font-semibold text-sm">
                        {user?.name.charAt(0).toUpperCase() || 'U'}
                    </div>
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate text-text-primary">
                        {user.name}
                    </p>
                    <p className="text-xs truncate text-text-muted">
                        {user.email}
                    </p>
                </div>
                <ChevronDown className={`w-4 h-4 text-text-muted group-hover:text-text-primary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <Popover
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                trigger={triggerRef.current}
            >
                <div style={{ minWidth: triggerRef.current?.offsetWidth ?? 200 }} className="p-1">
                    <button
                        onClick={() => { setIsOpen(false); navigate({ to: '/settings' }); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary hover:bg-[var(--color-sidebar-hover)] rounded-md transition-colors"
                    >
                        <Settings className="w-4 h-4 flex-shrink-0 text-text-muted" />
                        Account Settings
                    </button>

                    <div className="border-t border-[var(--color-border)] my-1" />

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-[var(--color-sidebar-hover)] rounded-md transition-colors"
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0" />
                        Logout
                    </button>
                </div>
            </Popover>
        </>
    );
}
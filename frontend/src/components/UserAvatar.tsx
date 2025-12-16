// import { useAuth } from "@/hooks/useAuth";

import { useCurrentUser } from "@/hooks/auth";
import { ChevronDown } from 'lucide-react';

export function UserProfile() {
    const { data: user, isLoading } = useCurrentUser();

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
        <button className="flex items-center gap-3 hover:bg-[var(--color-sidebar-hover)] rounded-lg px-3 py-2 transition-colors group">
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
            <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
        </button>
    );
}
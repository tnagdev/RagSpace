import { useLocation, useNavigate } from '@tanstack/react-router'
import { createContext, useContext, type FC, useState } from "react"
import { NavItems } from "@/routes/PrivateRoute";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Logo } from './Logo';
import { IconButton } from './IconButton';
import { NavLink } from './NavLink';
import { UsageWidget } from './UsageWidget';
import { usePlansModal } from '@/contexts/PlansModalContext';


interface SidebarProps {
    className?: string;
}


export const SidebarContext = createContext<{
    isOpen: boolean;
    setIsOpen: ((isOpen: boolean) => void) | null;
}>({
    isOpen: true,
    setIsOpen: null,
});


export const triggerCountryModal = () => {
    window.dispatchEvent(new CustomEvent('openCountryModal'));
};

export const Sidebar: FC<SidebarProps> = ({ className }) => {
    const { isOpen, setIsOpen } = useContext(SidebarContext);
    const navigate = useNavigate();
    const location = useLocation();
    const { openPlansModal } = usePlansModal();
    const [isUsageExpanded, setIsUsageExpanded] = useState(false);

    const handleNavClick = async (item: any, e: React.MouseEvent) => {
        if (item?.path === '/countries') {
            e.preventDefault();
            if (!location.pathname.includes('/countries')) {
                await navigate({ to: item.path });
            }
            setTimeout(() => triggerCountryModal(), 50);
        }
    };

    return <aside
        className={`relative bg-linear-to-b from-sidebar-bg-start to-sidebar-bg-end text-white shadow-2xl transform transition-all duration-300 ease-in-out flex flex-col ${isOpen ? 'w-64' : 'w-20'} ${className || ''}`}
    >
        {/* Logo Section */}
        <div className={`flex items-center justify-between p-3 ${!isOpen ? 'justify-center' : ''}`}>
            <Logo collapsed={!isOpen} showText={isOpen} className="text-white" />
        </div>

        {/* Toggle Button */}
        <IconButton
            variant="gradient"
            size="sm"
            onClick={() => setIsOpen?.(!isOpen)}
            className="absolute! -right-3 top-12 w-6 h-6 z-50"
            icon={isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        />

        {/* Main Menu Label */}
        <div className={`px-6 pt-6 pb-3 ${!isOpen ? 'px-0 text-center' : ''}`}>
            <span className={`text-xs font-semibold text-accent-secondary uppercase tracking-wider ${!isOpen ? 'hidden' : ''}`}>
                Main Menu
            </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-1 custom-scrollbar flex flex-col items-center">
            {NavItems.map((item) => {
                const isActive = location.pathname.startsWith(item?.path as string);
                const IconComponent = item?.icon as React.FC<React.SVGProps<SVGSVGElement>>;

                return (
                    <NavLink
                        key={item?.path}
                        to={item?.path as string}
                        label={item?.name as string}
                        isActive={isActive}
                        collapsed={!isOpen}
                        className={isOpen ? 'w-full' : 'w-fit'}
                        onClick={(e) => handleNavClick(item, e)}
                        icon={IconComponent ? <IconComponent className="w-5 h-5" /> : null}
                    />
                );
            })}
        </nav>

        {/* Combined Usage Section */}
        <div className={`mx-3 mb-6 rounded-xl bg-sidebar-hover border border-sidebar-border transition-all duration-300 ${!isOpen ? 'opacity-0 h-0 p-0 m-0 overflow-hidden' : 'opacity-100'}`}>
            {/* Header with collapse toggle */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-sidebar-border/30 transition-colors rounded-t-xl"
                onClick={() => setIsUsageExpanded(!isUsageExpanded)}
            >
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-accent-primary" />
                    <span className="text-xs font-semibold text-text-secondary">Usage</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openPlansModal('Upgrade your plan for more resources');
                        }}
                        className="text-xs text-accent-primary hover:text-accent-primary-hover transition-colors"
                    >
                        Upgrade
                    </button>
                    {isUsageExpanded ? (
                        <ChevronUp className="w-4 h-4 text-text-muted" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-text-muted" />
                    )}
                </div>
            </div>

            {/* Collapsible Content */}
            {isUsageExpanded && (
                <div className="px-4 pb-4">
                    <UsageWidget variant="sidebar" />
                </div>
            )}
        </div>
    </aside>
}
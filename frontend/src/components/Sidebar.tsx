import { useLocation, useNavigate } from '@tanstack/react-router'
import { createContext, useContext, type FC } from "react"
import { NavItems } from "@/routes/PrivateRoute";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Logo } from './Logo';
import { IconButton } from './IconButton';
import { NavLink } from './NavLink';
import { useStorageStats } from '@/hooks/useUpload';
import ConversationList from '@/pages/chat/components/ConversationList';
import { useConversations } from '@/hooks/useChat';


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
    const { data: storageStats, isLoading: isLoadingStorage } = useStorageStats();
    const conversationsQuery = useConversations();

    const isChatPage = location.pathname.startsWith('/chat');

    const handleNavClick = async (item: any, e: React.MouseEvent) => {
        if (item?.path === '/countries') {
            e.preventDefault();
            if (!location.pathname.includes('/countries')) {
                await navigate({ to: item.path });
            }
            setTimeout(() => triggerCountryModal(), 50);
        }
    };

    const handleSelectConversation = (conversationId: string) => {
        navigate({ to: '/chat', search: { conversation_id: conversationId } });
    };

    const handleNewChat = () => {
        navigate({ to: '/chat' });
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

            {/* Chat Conversations - Show only on chat page */}
            {isChatPage && isOpen && (
                <div className="w-full mt-4 pt-4 border-t border-sidebar-border">
                    <ConversationList
                        conversations={conversationsQuery.data || []}
                        currentConversationId={new URLSearchParams(location.search).get('conversation_id') || undefined}
                        onSelectConversation={handleSelectConversation}
                        onNewChat={handleNewChat}
                        isLoading={conversationsQuery.isLoading}
                    />
                </div>
            )}
        </nav>

        {/* Storage Plan Section */}
        <div className={`p-4 mx-3 mb-6 rounded-xl bg-sidebar-hover border border-sidebar-border transition-all duration-300 ${!isOpen ? 'opacity-0 h-0 p-0 m-0 overflow-hidden' : 'opacity-100'}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary">Storage Plan</span>
                <span className="text-xs text-accent-primary cursor-pointer hover:text-accent-primary-hover transition-colors">
                    Upgrade
                </span>
            </div>
            {isLoadingStorage ? (
                <div className="text-xs text-text-muted">Loading...</div>
            ) : storageStats ? (
                <>
                    <div className="mb-2">
                        <div className="w-full bg-sidebar-border rounded-full h-2">
                            <div
                                className="bg-linear-to-r from-gradient-primary-start to-gradient-primary-end h-2 rounded-full transition-all duration-500"
                                style={{ width: `${storageStats.usedPercentage}%` }}
                            ></div>
                        </div>
                    </div>
                    <p className="text-xs text-text-muted">
                        {storageStats.usedGB} of {storageStats.totalGB} GB ({storageStats.fileCount} files)
                    </p>
                </>
            ) : (
                <p className="text-xs text-text-muted">Unable to load storage info</p>
            )}
        </div>
    </aside>
}
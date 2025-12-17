import Header from "@/components/Header"
import { Sidebar, SidebarContext } from "@/components/Sidebar"
import { useCurrentUser } from "@/hooks/auth";
import { Navigate, Outlet } from "@tanstack/react-router"
import { useState } from "react";

export const RootLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const { isError } = useCurrentUser();

    if (isError) {
        return <Navigate to="/auth/login" />;
    }

    return <div className="flex flex-row h-screen bg-gradient-to-br from-[var(--color-bg-primary)] via-[var(--color-sidebar-bg-start)] to-[var(--color-sidebar-bg-end)]">
        <SidebarContext.Provider value={{ isOpen: sidebarOpen, setIsOpen: setSidebarOpen }}>
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
                <Header />
                <div className="flex-1 overflow-auto relative custom-scrollbar">
                    <div className="px-8 py-6">
                        <Outlet />
                    </div>
                </div>
            </div>
        </SidebarContext.Provider>
    </div>
}
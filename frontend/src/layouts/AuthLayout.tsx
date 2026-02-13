import { Outlet } from "@tanstack/react-router";
import { IoSparkles, IoChatbubbleEllipses } from "react-icons/io5";

export const AuthLayout = () => {
    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0a1f 0%, #1a1a3e 50%, #0f0f2e 100%)' }}>
            {/* Gradient Orbs - Fixed Position */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full blur-3xl animate-pulse"
                    style={{ background: '#a855f7', opacity: 0.12, animationDuration: '8s' }} />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse"
                    style={{ background: '#ec4899', opacity: 0.12, animationDuration: '10s', animationDelay: '2s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-3xl animate-pulse"
                    style={{ background: '#7c3aed', opacity: 0.08, animationDuration: '12s', animationDelay: '4s' }} />
            </div>

            {/* Top Logo Bar - Fixed */}
            <div className="sticky top-0 left-0 right-0 p-4 sm:p-6 z-20 bg-linear-to-b from-black/20 to-transparent backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xl" style={{ background: 'linear-gradient(to bottom right, #a855f7, #7c3aed)' }}>
                        <IoSparkles size={20} className="text-white" />
                    </div>
                    <span className="text-xl font-bold text-white tracking-tight">FiloRag</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="p-4 sm:p-6 flex-1 flex items-center justify-center">
                <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 z-10">

                    {/* Left Side - Premium Welcome Section (Sticky) */}
                    <div className="hidden lg:flex flex-col items-center justify-center h-fit! sticky top-36">
                        <div className="relative w-full max-w-lg">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full blur-3xl opacity-5" style={{ background: 'linear-gradient(to bottom right, #a855f7, #7c3aed)' }} />
                                <div className="relative space-y-8">
                                    <div className="flex justify-center">
                                        <div className="relative">
                                            <div className="w-32 h-32 backdrop-blur-xl rounded-3xl rotate-45 flex items-center justify-center border border-purple-500/20" style={{ background: 'linear-gradient(to bottom right, rgba(168, 85, 247, 0.2), rgba(124, 58, 237, 0.2))' }}>
                                                <div className="w-24 h-24 rounded-2xl -rotate-45 flex items-center justify-center shadow-2xl" style={{ background: 'linear-gradient(to bottom right, #a855f7, #7c3aed)', boxShadow: '0 20px 25px -5px rgba(168, 85, 247, 0.4)' }}>
                                                    <IoChatbubbleEllipses size={48} className="text-white" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-center space-y-6">
                                        <div className="space-y-3">
                                            <h1 className="text-5xl font-bold tracking-tight">
                                                <span className="text-white">Welcome to</span>
                                            </h1>
                                            <h2 className="text-6xl font-bold bg-clip-text text-transparent pb-3" style={{ backgroundImage: 'linear-gradient(to right, #a855f7, #ec4899, #f472b6)' }}>
                                                FiloRag
                                            </h2>
                                        </div>
                                        <p className="text-xl text-white/70 font-light max-w-md mx-auto leading-relaxed">
                                            Your intelligent document companion. Chat with your files using advanced AI technology.
                                        </p>
                                        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                                            <div className="px-4 py-2 backdrop-blur-xl rounded-full border border-purple-500/20" style={{ background: 'rgba(168, 85, 247, 0.08)' }}>
                                                <span className="text-sm text-white/80 font-medium">AI-Powered</span>
                                            </div>
                                            <div className="px-4 py-2 backdrop-blur-xl rounded-full border border-purple-500/20" style={{ background: 'rgba(168, 85, 247, 0.08)' }}>
                                                <span className="text-sm text-white/80 font-medium">Secure</span>
                                            </div>
                                            <div className="px-4 py-2 backdrop-blur-xl rounded-full border border-purple-500/20" style={{ background: 'rgba(168, 85, 247, 0.08)' }}>
                                                <span className="text-sm text-white/80 font-medium">Lightning Fast</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side - Auth Form Card (Scrollable) */}
                    <div className="w-full max-w-md mx-auto lg:mx-0">
                        <div className="backdrop-blur-2xl rounded-4xl p-6 sm:p-8 border border-purple-500/10 shadow-2xl" style={{ background: 'rgba(19, 19, 46, 0.95)' }}>
                            <Outlet />
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer - Fixed */}
            <div className="z-10 py-4 pointer-events-none">
                <div className="flex items-center justify-center gap-4 text-xs text-white/50 pointer-events-auto">
                    <a href="#" className="hover:text-white/80 transition-colors">Privacy</a>
                    <span>•</span>
                    <a href="#" className="hover:text-white/80 transition-colors">Terms</a>
                    <span>•</span>
                    <span>© 2025 FiloRag</span>
                </div>
            </div>
        </div>
    );
};
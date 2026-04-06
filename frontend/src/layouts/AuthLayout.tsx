import { Link, Outlet } from "@tanstack/react-router";
import logoImg from '@/assets/logo-filorag-bordered.png';

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
                <img src={logoImg} alt="FiloRag" className="h-8 w-auto object-contain" />
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
                                        {/* <img src={logoImg} alt="FiloRag" className="h-24 w-auto object-contain" /> */}
                                    </div>
                                    <div className="text-center space-y-6">
                                        <div className="space-y-3">
                                            <h1 className="text-5xl font-bold tracking-tight">
                                                <span className="text-white">Welcome to</span>
                                            </h1>
                                            <h2 className="text-6xl font-bold bg-clip-text text-transparent py-3 flex justify-center" style={{ backgroundImage: 'linear-gradient(to right, #a855f7, #ec4899, #f472b6)' }}>
                                                <img src={logoImg} alt="FiloRag" className="h-24 w-auto object-contain" />
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
                    <Link to="/privacy" className="hover:text-white/80 transition-colors" style={{ textDecoration: 'none', color: 'inherit' }}>Privacy</Link>
                    <span>•</span>
                    <Link to="/terms" className="hover:text-white/80 transition-colors" style={{ textDecoration: 'none', color: 'inherit' }}>Terms</Link>
                    <span>•</span>
                    <span>© {new Date().getFullYear()} FiloRag</span>
                </div>
            </div>
        </div>
    );
};
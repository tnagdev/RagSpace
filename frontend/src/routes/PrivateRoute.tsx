import { createRoute, Navigate, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { MainRoute } from ".";
import { RootLayout } from "../layouts/RootLayout";
import { hasAccessToken } from "@/api/auth";
import { useCurrentUser } from "@/hooks/auth";
import { Activity, Settings, Globe, Briefcase, BarChart3, FileText, Folder, Search } from 'lucide-react';
import FilesPage from "@/pages/files/FilesPage";
import SearchPage from "@/pages/search/SearchPage";


export interface NavRoute {
    name: string;
    path: string;
    params?: Record<string, any>;
    redirect?: boolean;
    children?: Array<NavRoute>;
    component: React.FC;
    icon?: string | React.FC<React.SVGProps<SVGSVGElement>> | null;
    nav?: boolean;
}


const NavRoutes: Array<NavRoute> = [
    {
        name: 'My Files',
        path: '/files',
        component: () => <Outlet />,
        icon: Folder,
        nav: true,
        children: [
            {
                name: 'Files',
                path: '/',
                component: () => <FilesPage />,
            }
        ],
    },
    {
        name: 'Search',
        path: '/search',
        component: () => <Outlet />,
        nav: true,
        icon: Search,
        children: [
            {
                name: 'Search',
                path: '/',
                component: () => <SearchPage />,
            }
        ],
    }
];


export const RedirectOutlet = ({ route }: any) => {
    const location = useLocation();
    const pathName = location.pathname.endsWith('/') ? location.pathname.slice(0, -1) : location.pathname;
    if (pathName === route.path)
        return <Navigate to={route.path + '/' + route?.children?.[0]?.path} />;
    return <Outlet />;
}

const _PrivateRoute = createRoute({
    getParentRoute: () => MainRoute,
    component: () => {
        const location = useLocation();
        if (location.pathname === '/') {
            return <Navigate to="/files" />;
        }
        return <RootLayout />;
    },
    beforeLoad: async () => {
        const isValid = hasAccessToken();
        if (!isValid) {
            throw redirect({ to: '/auth/login' });
        }
        return {};
    },
    pendingComponent: () => (
        <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
                <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                <p className="text-gray-600">Loading...</p>
            </div>
        </div>
    ),
    path: '/',
})

const navLinks = NavRoutes.map(item => {
    const route = createRoute({
        path: item.path,
        component: item.redirect ? () => <RedirectOutlet route={item} /> : item.component,
        getParentRoute: () => _PrivateRoute,
        staticData: item.params
    });
    if (item.children) {
        route.addChildren(item.children.map(subItem => createRoute({
            path: subItem.path,
            component: subItem.component,
            getParentRoute: () => route,
            staticData: subItem.params
        })));
    }
    return route;
});


const PrivateRoute = _PrivateRoute.addChildren(navLinks);

const NavItems = NavRoutes.map(item => item.nav ? ({
    name: item.name,
    path: item.path,
    children: item.children ? item.children.map(sub => ({ name: sub.name, path: item.path + '/' + sub.path })) : [],
    redirect: item.redirect,
    icon: item.icon
}) : null).filter(Boolean);


export default PrivateRoute;
export type PrivateRouteType = typeof PrivateRoute;
export { NavItems };
import { createRoute, Navigate, redirect } from "@tanstack/react-router";
import { MainRoute } from ".";
import { AuthLayout } from "../layouts/AuthLayout";
import { RedirectOutlet, type NavRoute } from "./PrivateRoute";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import { hasAccessToken } from "@/api/auth";


const NavRoutes: NavRoute[] = [
    {
        name: 'root',
        path: '/',
        component: () => <Navigate to={'/auth/login'} />,
    },
    {
        name: 'login',
        path: 'login',
        component: () => <LoginPage />,
    },
    {
        name: 'signup',
        path: 'signup',
        component: () => <SignupPage />,
    }
    // {
    //     name: 'callback',
    //     path: 'callback',
    //     component: () => <AuthCallbackPage />,
    // }
];

const _PublicRoute = createRoute({
    path: 'auth',
    getParentRoute: () => MainRoute,
    beforeLoad: () => {
        if (hasAccessToken()) {
            console.log('User already authenticated, redirecting to app');
            throw redirect({ to: '/files' });
        }
    },
    component: () => <AuthLayout />,
});

const navLinks = NavRoutes.map(item => {
    const route = createRoute({
        path: item.path,
        component: item.redirect ? () => <RedirectOutlet route={item} /> : item.component,
        getParentRoute: () => _PublicRoute,
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


const PublicRoute = _PublicRoute.addChildren(navLinks);

export default PublicRoute;
export type PublicRouteType = typeof PublicRoute;
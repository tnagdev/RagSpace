import { createRootRoute, createRouter, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import PrivateRoute from "./PrivateRoute";
import PublicRoute from "./PublicRoute";

const RootComponent = () => {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname]);
    return <Outlet />;
};

const MainRoute = createRootRoute({
    component: RootComponent,
});

const routeTree = MainRoute.addChildren([PrivateRoute, PublicRoute]);
const RootRouter = createRouter({ routeTree });

export { MainRoute };
export default RootRouter;
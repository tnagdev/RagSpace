import { createRootRoute, createRouter, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import PrivateRoute from "./PrivateRoute";
import PublicRoute from "./PublicRoute";

const MainRoute = createRootRoute({
    component: () => (
        <>
            <Outlet />
            <TanStackRouterDevtools />
        </>
    ),
});

const routeTree = MainRoute.addChildren([PrivateRoute, PublicRoute]);
const RootRouter = createRouter({ routeTree });

export { MainRoute };
export default RootRouter;
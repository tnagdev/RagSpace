import { createRootRoute, createRouter, Outlet } from "@tanstack/react-router";
import PrivateRoute from "./PrivateRoute";
import PublicRoute from "./PublicRoute";

const MainRoute = createRootRoute({
    component: () => (
        <>
            <Outlet />
        </>
    ),
});

const routeTree = MainRoute.addChildren([PrivateRoute, PublicRoute]);
const RootRouter = createRouter({ routeTree });

export { MainRoute };
export default RootRouter;
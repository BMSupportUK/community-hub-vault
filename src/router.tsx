import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { BmSplash } from "./components/app/BmSplash";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <BmSplash />,
    defaultPendingMs: 0,
    defaultPendingMinMs: 300,
  });

  return router;
};

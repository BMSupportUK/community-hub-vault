import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved")({
  beforeLoad: async () => {
    // Pending users are intercepted by the parent layout, but block the loader too.
    // (No data needed here; auth context handles redirect UI.)
  },
  component: () => <Outlet />,
});

import { createFileRoute, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import { isPageAllowed, pageKeyForPath, usePagePermissions } from "@/lib/page-access";

const ApprovedDeferredExtras = lazy(() =>
  import("@/components/app/ApprovedDeferredExtras").then((module) => ({
    default: module.ApprovedDeferredExtras,
  })),
);

function DeferUntilIdle({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(id);
  }, []);
  if (!ready) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

export const Route = createFileRoute("/_authenticated/_approved")({
  beforeLoad: async () => {
    // Pending users are intercepted by the parent layout, but block the loader too.
    // (No data needed here; auth context handles redirect UI.)
  },
  component: ApprovedLayout,
});

function ApprovedLayout() {
  const { roles } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const perms = usePagePermissions();

  // Fan Zone routes have their own membership gating; page permissions cover
  // the BM Support side only.
  const blocked = !isFanZonePath(path) && !isPageAllowed(pageKeyForPath(path), roles, perms);
  if (blocked) return <Navigate to="/home" replace />;

  return (
    <>
      <Outlet />
      <DeferUntilIdle>
        <ApprovedDeferredExtras />
      </DeferUntilIdle>
    </>
  );
}

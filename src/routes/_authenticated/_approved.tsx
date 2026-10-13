import { createFileRoute, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import { FanZoneBanGate } from "@/components/app/FanZoneBanGate";
import { isPageAllowed, pageKeyForPath, usePagePermissions } from "@/lib/page-access";
import { DemoRoleBanner } from "@/components/app/DemoRoleBanner";
import { useIsDemoAccount, isDemoLockedPath } from "@/hooks/use-demo-account";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

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
  const isDemo = useIsDemoAccount();

  // Fan Zone routes have their own membership gating; page permissions cover
  // the BM Support side only.
  const key = pageKeyForPath(path);
  const blocked =
    key !== "home" && // never redirect the fallback page onto itself
    !isFanZonePath(path) &&
    !isPageAllowed(key, roles, perms);
  if (blocked) return <Navigate to="/home" replace />;

  if (isFanZonePath(path)) {
    return (
      <FanZoneBanGate>
        <Outlet />
        <DeferUntilIdle>
          <ApprovedDeferredExtras />
        </DeferUntilIdle>
      </FanZoneBanGate>
    );
  }

  const page = (
    <DemoGate path={path}>
      <Outlet />
    </DemoGate>
  );

  return (
    <>
      {isDemo ? (
        // The page shell lays pages out in a row, so the demo banner must sit in
        // its own column above the page or it squeezes the page to zero width.
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DemoRoleBanner />
          <div className="flex min-h-0 min-w-0 flex-1">{page}</div>
        </div>
      ) : (
        page
      )}
      <DeferUntilIdle>
        <ApprovedDeferredExtras />
      </DeferUntilIdle>
    </>
  );
}

function DemoGate({ path, children }: { path: string; children: ReactNode }) {
  const { user, roles } = useAuth();
  const demo = useIsDemoAccount();
  const own = (user?.user_metadata?.username as string | undefined) ?? null;
  if (!demo || !isDemoLockedPath(path, own, roles.includes("staff"))) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-full bg-surface-2 p-4">
        <Lock className="size-8 text-muted-foreground" />
      </div>
      <h1 className="font-display text-xl font-bold">Not available on the demo</h1>
      <p className="text-sm text-muted-foreground">
        This section holds live member details, app downloads or DNS codes, so it's locked on the demo account.
      </p>
      <Link to="/home" className="text-sm font-semibold text-primary hover:underline">Back to home</Link>
    </div>
  );
}

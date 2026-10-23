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
import { PortalLock } from "@/components/app/PortalLock";
import { isPortalPath } from "@/lib/customer-portal";
import { StaffPortalTabs, isStaffPortalPath } from "@/components/app/StaffPortalTabs";
import { isStaffPortalUser } from "@/lib/portal-home";
import { PortalTabs } from "@/components/app/PortalTabs";
import { isPortalQuickLinkPath } from "@/components/app/portal-quick-links";

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
  const resolvedPath = useRouterState({ select: (r) => r.resolvedLocation?.pathname ?? r.location.pathname });
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

  // While navigating away, the old portal page can still render for a moment;
  // keep the lock on if either the shown or the target page is a portal page.
  // The Customer Portal welcome page stays open; it offers its own Unlock button.
  const isPortalHome = (x: string) => x === "/portal" || x === "/portal/";
  const portalGate = (isPortalPath(path) && !isPortalHome(path)) || (isPortalPath(resolvedPath) && !isPortalHome(resolvedPath));
  const inner = portalGate ? <PortalLock><Outlet /></PortalLock> : <Outlet />;
  // Every BM Support page shares the portal header (pages that render their own
  // PortalTabs are skipped), so the rail never falls back to its icon copies.
  const staffPortalUser = isStaffPortalUser(roles);
  const ownTabs = isPortalPath(path) && path !== "/shop" && path !== "/tickets";
  const threadPage = path.startsWith("/tickets/");
  const staffTabs = staffPortalUser && !threadPage && (!ownTabs || isStaffPortalPath(path) || isPortalQuickLinkPath(path));
  const customerTabs = !staffPortalUser && !threadPage && (!isPortalPath(path) || path === "/shop");
  const page = (
    <DemoGate path={path}>
      {staffTabs || customerTabs ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {staffTabs ? <StaffPortalTabs /> : <PortalTabs />}
          {/* Pages without their own scroller rely on this area scrolling;
              overflow-hidden here would clip them on locked viewports. */}
          <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
            {inner}
          </div>
        </div>
      ) : inner}
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

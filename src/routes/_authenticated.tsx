import { createFileRoute, Outlet, redirect, useRouterState, Navigate, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Shield, ShieldCheck, Menu, Receipt } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { IconRail } from "@/components/app/IconRail";
import { logMyIp } from "@/lib/ip-log.functions";
import { useOnlineUsers, setPresencePage } from "@/hooks/use-online-users";
import { pageLabelForPath } from "@/lib/page-labels";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { isAllowedForFanZoneOnly, isFanZonePath } from "@/lib/fan-zone-nav";
import { useFanZoneMembershipState } from "@/hooks/use-fan-zone";
import { BmSplash } from "@/components/app/BmSplash";
import { screenLockMayBeLocked } from "@/lib/screen-lock-hash";
import { ScreenLockProvider } from "@/components/app/ScreenLockProvider";
import { useViewportLockable } from "@/hooks/use-viewport-lock";
import { useIsMobile } from "@/hooks/use-mobile";


// Defer non-critical header widgets & alerts so the shell paints immediately.
const MentionsBadge = lazy(() => import("@/components/app/MentionsBadge").then((m) => ({ default: m.MentionsBadge })));
const NotificationBell = lazy(() => import("@/components/app/NotificationBell").then((m) => ({ default: m.NotificationBell })));
const TwoFactorPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.TwoFactorPill })));
const VpnPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.VpnPill })));
const Clocks = lazy(() => import("@/components/app/Clocks").then((m) => ({ default: m.Clocks })));
const LockNowPill = lazy(() => import("@/components/app/ScreenLockProvider").then((m) => ({ default: m.LockNowPill })));

const BreakEndingAlert = lazy(() => import("@/components/app/BreakEndingAlert").then((m) => ({ default: m.BreakEndingAlert })));
const ShiftStartEndAlert = lazy(() => import("@/components/app/ShiftStartEndAlert").then((m) => ({ default: m.ShiftStartEndAlert })));
const ModerationPendingBadge = lazy(() => import("@/components/app/ModerationPendingBadge").then((m) => ({ default: m.ModerationPendingBadge })));
const PendingOrdersBadge = lazy(() => import("@/components/app/PendingOrdersBadge").then((m) => ({ default: m.PendingOrdersBadge })));
const GpsCapture = lazy(() => import("@/components/app/GpsCapture").then((m) => ({ default: m.GpsCapture })));

function DeferUntilIdle({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}

function OnlinePresence() {
  useOnlineUsers();
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    setPresencePage(pageLabelForPath(path));
  }, [path]);
  return null;
}


export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Skip during SSR/prerender — Supabase session lives in localStorage and
    // is unavailable on the server, which would falsely redirect signed-in
    // users to /login on every F5/page reload.
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } as never });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, isPending, isBanned, isRejected, isMod, isStaff, hasAny, user, isFanZoneOnly } = useAuth();
  // Fan Zone applicants wait on the Fan Zone screen, never the BM Support gate.
  const { info: fanZoneInfo } = useFanZoneMembershipState(user?.id);
  const fanZoneApplicant = fanZoneInfo?.status === "pending";
  const isAdmin = hasAny(["admin", "management"]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const inFanZone = isFanZonePath(path);
  const search = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const shopTab = typeof search.tab === "string" ? search.tab : undefined;
  const shopView = typeof search.view === "string" ? search.view : undefined;
  const lockable = useViewportLockable();
  const isMobile = useIsMobile();
  // Chat surfaces pin their composer to the bottom, but only on large
  // screens — on smaller screens the whole page scrolls like any other.
  const chatSurface = lockable && (path === "/tickets" || /^\/home\/[^/]+$/.test(path));
  // Pages that run their own internal scrolling panels when locked.
  const selfScrolling =
    chatSurface ||
    path === "/admin" ||
    path.startsWith("/u/") ||
    path === "/account-security" ||
    path === "/fan-zone-security" ||
    path === "/knowledge-base" ||
    path === "/install-guides" ||
    path === "/sports-guides";
  // Everything else locks to the viewport on large screens and scrolls
  // normally on smaller ones.
  const locksToViewport = chatSurface || lockable || (path === "/install-guides" && !isMobile);
  void shopTab;
  void shopView;
  const logIp = useServerFn(logMyIp);
  const loggedRef = useRef(false);
  const [navOpen, setNavOpen] = useState(false);
  const openSalesChats = () => {
    if (!isAdminUnlocked(user?.id)) {
      navigate({ to: "/admin", search: { next: "/shop?view=orders&scope=all" } as never });
      return;
    }
    navigate({ to: "/shop", search: { view: "orders", scope: "all" } as never });
  };
  // Close mobile drawer on route change
  useEffect(() => { setNavOpen(false); }, [path]);
  // Routes with panel-level scrolling must not make the document itself scroll.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = locksToViewport ? "hidden" : "";
    body.style.overflow = locksToViewport ? "hidden" : "";
    html.style.height = locksToViewport ? "100%" : "";
    body.style.height = locksToViewport ? "100%" : "";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
      html.style.height = "";
      body.style.height = "";
    };
  }, [locksToViewport]);

  useEffect(() => {
    if (loading || isPending || !user?.id || loggedRef.current) return;
    loggedRef.current = true;
    // Fire-and-forget, and defer past first paint so it never blocks
    // the initial render pipeline.
    const run = () => {
      logIp().catch(() => {
        loggedRef.current = false;
      });
    };
    const id = window.setTimeout(run, 800);
    return () => window.clearTimeout(id);
  }, [loading, isPending, user?.id, logIp]);


  if (loading) {
    // Only cover the app while it loads when a lock might be due — otherwise
    // there is nothing to hide and a splash just gets in the way.
    return screenLockMayBeLocked() ? <BmSplash /> : null;
  }


  // Auth state clears before route navigation completes during sign-out.
  // Handle that state first so an empty role list can never route via /gate.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Banned users are locked to /banned
  if (isBanned && !path.startsWith("/banned")) {
    return <Navigate to="/banned" />;
  }

  // Rejected users stay in the security gate, which shows the
  // "Account Not Activated" state with the option to appeal.
  if (isRejected && !path.startsWith("/gate")) {
    return <Navigate to="/gate" />;
  }

  // Pending users are locked to their waiting room
  if (isPending && fanZoneApplicant && !path.startsWith("/fan-zone-pending")) {
    return <Navigate to="/fan-zone-pending" />;
  }
  if (isPending && !fanZoneApplicant && !path.startsWith("/gate")) {
    return <Navigate to="/gate" />;
  }

  // Fan-Zone-only accounts never see BM Support pages.
  if (isFanZoneOnly && !isAllowedForFanZoneOnly(path)) {
    return <Navigate to="/forum" />;
  }

  return (
    <ScreenLockProvider>
      <div className={locksToViewport ? "fixed inset-0 flex h-dvh w-dvw overflow-hidden bg-background" : "relative flex min-h-dvh w-full bg-background"}>
        <IconRail />
        <div className={locksToViewport ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "flex min-h-dvh min-w-0 flex-1 flex-col"}>
{!inFanZone && <header className="h-14 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 lg:px-4 gap-1.5 lg:gap-3 overflow-hidden mb-1">
          <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-1">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger
                className="md:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-surface-2 text-muted-foreground"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-auto bg-rail border-r border-border">
                {navOpen ? <IconRail inSheet /> : null}
              </SheetContent>
            </Sheet>
            {isAdmin && (
              <Link
                to="/admin"
                title="Admin | Admin Panel"
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <LayoutDashboard className="size-4" />
                <span className="hidden xl:inline">Admin | Admin Panel</span>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/moderation"
                title="Admin | Access Requests"
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <Shield className="size-4" />
                <span className="hidden xl:inline">Admin | Access Requests</span>
                <DeferUntilIdle><ModerationPendingBadge /></DeferUntilIdle>
              </Link>
            )}
            {isAdmin && (
              <button
                type="button"
                title="Admin | Shop Orders"
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
                onClick={openSalesChats}
              >
                <Receipt className="size-4" />
                <span className="hidden xl:inline">Admin | Shop Orders</span>
                <DeferUntilIdle><PendingOrdersBadge /></DeferUntilIdle>
              </button>
            )}
            {isAdmin && (
              <Link
                to="/admin-roles"
                title="Members & Role Management"
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <ShieldCheck className="size-4" />
                <span className="hidden xl:inline">Members &amp; Role Management</span>
              </Link>
            )}
            {user && (
              <DeferUntilIdle>
                <MentionsBadge />
              </DeferUntilIdle>
            )}
            {user && (
              <DeferUntilIdle>
                <NotificationBell />
              </DeferUntilIdle>
            )}
          </div>
          <div className="hidden xl:flex flex-1 min-w-0 px-3" />
            <DeferUntilIdle>
              <Clocks />
            </DeferUntilIdle>
            <DeferUntilIdle>
              <LockNowPill />
            </DeferUntilIdle>
            <DeferUntilIdle>
              <TwoFactorPill />
            </DeferUntilIdle>

            <DeferUntilIdle>
              <VpnPill />
            </DeferUntilIdle>
        </header>}
        <div
          className={
            locksToViewport
              ? selfScrolling
                ? "flex min-h-0 flex-1 overflow-hidden"
                : "flex min-h-0 flex-1 overflow-y-auto"
              : "flex flex-1"
          }
        >
          <Outlet />
        </div>
        <DeferUntilIdle>
          <BreakEndingAlert />
        </DeferUntilIdle>
        <DeferUntilIdle>
          <ShiftStartEndAlert />
        </DeferUntilIdle>
        <DeferUntilIdle>
          <GpsCapture />
        </DeferUntilIdle>
        <DeferUntilIdle>
          <OnlinePresence />
        </DeferUntilIdle>
        </div>
      </div>
    </ScreenLockProvider>
  );
}

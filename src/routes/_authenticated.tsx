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
import { useOnlineUsers } from "@/hooks/use-online-users";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { isAllowedForFanZoneOnly, isFanZonePath } from "@/lib/fan-zone-nav";
import { useFanZoneMembershipState } from "@/hooks/use-fan-zone";

// Defer non-critical header widgets & alerts so the shell paints immediately.
const Clocks = lazy(() => import("@/components/app/Clocks").then((m) => ({ default: m.Clocks })));
const MentionsBadge = lazy(() => import("@/components/app/MentionsBadge").then((m) => ({ default: m.MentionsBadge })));
const NotificationBell = lazy(() => import("@/components/app/NotificationBell").then((m) => ({ default: m.NotificationBell })));
const TwoFactorPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.TwoFactorPill })));
const VpnPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.VpnPill })));
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
  // Screen lock removed — the whole app scrolls naturally on every route.
  const unlockShell = true;
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
  // Ensure no leftover viewport lock from previous sessions/routes.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.remove("app-shell-locked");
    html.style.overflow = "";
    body.style.overflow = "";
    html.style.height = "";
    body.style.height = "";
    body.style.position = "";
    body.style.width = "";
  }, [path]);

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
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
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

  // Rejected users are locked to /account-rejected
  if (isRejected && !path.startsWith("/account-rejected")) {
    return <Navigate to="/account-rejected" />;
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
    <div className={unlockShell ? "relative flex min-h-dvh w-full bg-background" : "relative flex min-h-dvh w-full bg-background md:fixed md:inset-0 md:h-dvh md:w-dvw md:overflow-hidden"}>
      <IconRail />
      <div className={unlockShell ? "flex-1 flex flex-col min-w-0 min-h-dvh" : "flex-1 flex flex-col min-w-0 min-h-dvh md:h-full md:min-h-0 md:overflow-hidden"}>
        {!inFanZone && <header className="h-14 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 lg:px-4 gap-1.5 lg:gap-3 overflow-x-auto scrollbar-thin mb-1">
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
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
                title="Owner dashboard"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <LayoutDashboard className="size-4" />
                <span className="hidden xl:inline">Owner dashboard</span>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/moderation"
                title="Moderation"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <Shield className="size-4" />
                <span className="hidden xl:inline">Moderation</span>
                <DeferUntilIdle><ModerationPendingBadge /></DeferUntilIdle>
              </Link>
            )}
            {isAdmin && (
              <button
                type="button"
                title="Sales chats"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
                onClick={openSalesChats}
              >
                <Receipt className="size-4" />
                <span className="hidden xl:inline">Shop Owner</span>
                <DeferUntilIdle><PendingOrdersBadge /></DeferUntilIdle>
              </button>
            )}
            {isAdmin && (
              <Link
                to="/admin-roles"
                title="User roles"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <ShieldCheck className="size-4" />
                <span className="hidden xl:inline">User roles</span>
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
              <LockNowPill />
            </DeferUntilIdle>
            <DeferUntilIdle>
              <TwoFactorPill />
            </DeferUntilIdle>

            <DeferUntilIdle>
              <VpnPill />
            </DeferUntilIdle>
            <div className="hidden lg:flex items-center gap-2">
              <DeferUntilIdle>
                <Clocks />
              </DeferUntilIdle>
            </div>
        </header>}
        <div className={unlockShell ? "flex-1 flex" : "flex-1 flex md:min-h-0 md:overflow-hidden"}>
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
  );
}

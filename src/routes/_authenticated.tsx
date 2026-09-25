import { createFileRoute, Outlet, redirect, useRouterState, Navigate, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Shield, ShieldCheck, Menu, Receipt, ChevronDown, ChevronUp } from "lucide-react";
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
import { Capacitor } from "@capacitor/core";
import { reportNativeInstall } from "@/lib/app-transfer.functions";
import { ANDROID_RELEASE } from "@/lib/android-release";


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

/**
 * Inside the installed Android/Fire TV app, reports the install once per
 * device so the Download tab can show "Installed & opened". Reinstalls wipe
 * the WebView storage flag, so a fresh install reports again — as it should.
 */
function NativeInstallReporter() {
  const report = useServerFn(reportNativeInstall);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (window.localStorage.getItem("bm-install-reported")) return;
    void (async () => {
      try {
        await report({
          data: {
            userAgent: navigator.userAgent,
            platform: Capacitor.getPlatform(),
            appVersion: ANDROID_RELEASE.versionName,
          },
        });
        window.localStorage.setItem("bm-install-reported", "1");
      } catch {
        // Try again on the next app open.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Talk channels start with the main site header collapsed to a slim bar;
  // it can be expanded again with the chevron at any time.
  const inTalkChannel = /^\/home\/[^/]+$/.test(path);
  const [talkHeaderExpanded, setTalkHeaderExpanded] = useState(false);
  const [talkChannelName, setTalkChannelName] = useState<string | null>(null);
  useEffect(() => {
    if (inTalkChannel) setTalkHeaderExpanded(false);
  }, [inTalkChannel, path]);
  const talkHeaderCollapsed = inTalkChannel && !talkHeaderExpanded;
  useEffect(() => {
    if (!talkHeaderCollapsed) return;
    const slug = path.split("/")[2] ?? "";
    let alive = true;
    supabase
      .from("chat_channels")
      .select("name")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setTalkChannelName(data?.name ?? null);
      });
    return () => {
      alive = false;
    };
  }, [talkHeaderCollapsed, path]);
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
    // Keep the gate hidden until referral access and roles have resolved.
    return <BmSplash />;
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
{!inFanZone && talkHeaderCollapsed && (
          <button
            type="button"
            onClick={() => setTalkHeaderExpanded(true)}
            title="Show header"
            className="h-8 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
          >
            <ChevronDown className="size-3.5" />
            <span className="font-medium truncate">{talkChannelName ?? "Talk channel"}</span>
            <span className="hidden sm:inline opacity-70">— show header</span>
          </button>
        )}
        {!inFanZone && !talkHeaderCollapsed && (<header className="h-14 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 lg:px-4 gap-1.5 lg:gap-3 overflow-hidden mb-1">
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
            {inTalkChannel && (
              <button
                type="button"
                onClick={() => setTalkHeaderExpanded(false)}
                title="Hide header"
                aria-label="Hide header"
                className="shrink-0 inline-flex items-center justify-center size-8 rounded-md hover:bg-surface-2 text-muted-foreground ml-1"
              >
                <ChevronUp className="size-4" />
              </button>
            )}
        </header>)}
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
        <DeferUntilIdle>
          <NativeInstallReporter />
        </DeferUntilIdle>
        </div>
      </div>
    </ScreenLockProvider>
  );
}

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
import { isPageAllowed, usePagePermissions } from "@/lib/page-access";
import { ADMIN_CUSTOMERS_LINK, adminPanelLabel, canOpenAdminPanel, canOpenFanZoneAdminPanel } from "@/lib/admin-panel-access";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { isAllowedForFanZoneOnly, isFanZonePath } from "@/lib/fan-zone-nav";
import { useInFanZoneChrome } from "@/lib/sports-guides-origin";
import { useFanZoneMembershipState } from "@/hooks/use-fan-zone";
import { BmSplash } from "@/components/app/BmSplash";
import { ScreenLockProvider } from "@/components/app/ScreenLockProvider";
import { AutoBreakStartListener } from "@/components/app/BreakPlanRows";
import { useViewportLockable } from "@/hooks/use-viewport-lock";
import { useIsMobile } from "@/hooks/use-mobile";
import { Capacitor } from "@capacitor/core";
import { reportNativeInstall } from "@/lib/app-transfer.functions";
import { ANDROID_RELEASE } from "@/lib/android-release";
import { SupportNotificationScope } from "@/components/app/SupportNotificationScope";


// Defer non-critical header widgets & alerts so the shell paints immediately.
const MentionsBadge = lazy(() => import("@/components/app/MentionsBadge").then((m) => ({ default: m.MentionsBadge })));
const BmInboxBell = lazy(() => import("@/components/app/BmInboxBell").then((m) => ({ default: m.BmInboxBell })));
const NotificationBell = lazy(() => import("@/components/app/NotificationBell").then((m) => ({ default: m.NotificationBell })));
const ApprovedDeferredExtras = lazy(() => import("@/components/app/ApprovedDeferredExtras").then((m) => ({ default: m.ApprovedDeferredExtras })));
const TwoFactorPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.TwoFactorPill })));
const VpnPill = lazy(() => import("@/components/app/TwoFactorBanner").then((m) => ({ default: m.VpnPill })));
const Clocks = lazy(() => import("@/components/app/Clocks").then((m) => ({ default: m.Clocks })));
const LockNowPill = lazy(() => import("@/components/app/ScreenLockProvider").then((m) => ({ default: m.LockNowPill })));

const BreakEndingAlert = lazy(() => import("@/components/app/BreakEndingAlert").then((m) => ({ default: m.BreakEndingAlert })));
const ShiftStartEndAlert = lazy(() => import("@/components/app/ShiftStartEndAlert").then((m) => ({ default: m.ShiftStartEndAlert })));
const EarlyFinishAlert = lazy(() => import("@/components/app/EarlyFinishAlert").then((m) => ({ default: m.EarlyFinishAlert })));
const ModerationPendingBadge = lazy(() => import("@/components/app/ModerationPendingBadge").then((m) => ({ default: m.ModerationPendingBadge })));
const PendingOrdersBadge = lazy(() => import("@/components/app/PendingOrdersBadge").then((m) => ({ default: m.PendingOrdersBadge })));
const GpsCapture = lazy(() => import("@/components/app/GpsCapture").then((m) => ({ default: m.GpsCapture })));
const SeasonalEffects = lazy(() => import("@/components/app/SeasonalEffects").then((m) => ({ default: m.SeasonalEffects })));

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
    // Staff sent this user a temporary password: they must choose their own first.
    const { data: mustChange } = await supabase
      .from("password_change_required")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (mustChange) throw redirect({ to: "/reset-password", search: { forced: "1" } as never });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, isPending, isBanned, isRejected, isMod, isStaff, hasAny, user, isFanZoneOnly, roles } = useAuth();
  // Fan Zone applicants wait on the Fan Zone screen, never the BM Support gate.
  const { info: fanZoneInfo } = useFanZoneMembershipState(user?.id);
  const fanZoneApplicant = fanZoneInfo?.status === "pending";
  const isAdmin = hasAny(["admin", "management"]);
  // Staff and management get the same dashboard button as the owner, named
  // "Staff | Admin Panel". Hidden if the owner has unticked the dashboard for
  // their roles, so nobody is left with a button that bounces them to Home.
  const perms = usePagePermissions();
  const canOpenPanel = canOpenAdminPanel(roles) && isPageAllowed("admin", roles, perms);
  const panelLabel = adminPanelLabel(roles);
  // Fan Zone moderators who aren't staff get their own header button to the
  // Fan Zone dashboard; staff/management reach it from the BM dashboard.
  const canOpenFanZonePanel = !canOpenPanel && canOpenFanZoneAdminPanel(roles);
  // Members holding both a BM Support role and a Fan Zone role get a header
  // button to hop over to the Fan Zone (the Fan Zone header has the reverse).
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  // Sports guides reached from the Fan Zone (or by Fan-Zone-only accounts)
  // keep Fan Zone chrome, never the BM Support header.
  const inFanZone = useInFanZoneChrome(path, isFanZoneOnly);
  const search = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const shopTab = typeof search.tab === "string" ? search.tab : undefined;
  const shopView = typeof search.view === "string" ? search.view : undefined;
  const lockable = useViewportLockable();
  const isMobile = useIsMobile();
  // Bound chat pages on phones too, so messages scroll rather than expanding
  // the page and pushing the composer out of reach.
  const talkSurface = /^\/home\/[^/]+$/.test(path);
  const sportsGuideReader = path.startsWith("/sports-guides/read/");
  const chatSurface = talkSurface || path === "/tickets";
  // The main site header starts collapsed (slim bar) ONLY on the tickets page
  // and Talk channels; every other BM Support page keeps it open. It can be
  // collapsed/expanded again with the chevron at any time, and each navigation
  // resets to the page's own default. Talk channels also show the channel name
  // on the slim bar.
  const inTalkChannel = /^\/home\/[^/]+$/.test(path);
  const autoCollapse =
    path === "/tickets" || path.startsWith("/tickets/") || inTalkChannel;
  const [talkHeaderExpanded, setTalkHeaderExpanded] = useState(!autoCollapse);
  const [talkChannelName, setTalkChannelName] = useState<string | null>(null);
  useEffect(() => {
    setTalkHeaderExpanded(!autoCollapse);
  }, [path, autoCollapse]);
  const talkHeaderCollapsed = !talkHeaderExpanded;
  useEffect(() => {
    if (!inTalkChannel || !talkHeaderCollapsed) return;
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
  }, [talkHeaderCollapsed, inTalkChannel, path]);
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
  const locksToViewport = chatSurface || (lockable && !sportsGuideReader);
  void shopTab;
  void shopView;
  const logIp = useServerFn(logMyIp);
  const loggedRef = useRef(false);
  const [navOpen, setNavOpen] = useState(false);
  const openSalesChats = () => {
    if (!isAdminUnlocked(user?.id)) {
      navigate({ to: "/admin", search: { tab: "order-status" } as never });
      return;
    }
    navigate({ to: "/admin", search: { tab: "order-status" } as never });
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
    <ScreenLockProvider
      lockedExtras={
        <Suspense fallback={null}>
          <SupportNotificationScope>
          <BreakEndingAlert />
          <ShiftStartEndAlert />
          <EarlyFinishAlert />
          <AutoBreakStartListener />
          </SupportNotificationScope>
          <NotificationBell notificationsOnly />
          {!isPending && !isBanned && !isRejected && <ApprovedDeferredExtras notificationsOnly />}
        </Suspense>
      }
    >
      <div className={locksToViewport ? "fixed inset-0 flex h-dvh w-dvw overflow-hidden bg-background" : "relative flex min-h-dvh w-full bg-background"}>
        <IconRail />
        <div className={locksToViewport ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "flex min-h-dvh min-w-0 flex-1 flex-col"}>
        {/* Top header removed: phones keep a small menu button to open the side rail. */}
        {!inFanZone && (
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger
              className="md:hidden fixed left-2 top-2 z-40 inline-flex items-center justify-center size-9 rounded-md border border-border bg-surface/90 backdrop-blur text-muted-foreground shadow"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-auto bg-rail border-r border-border [&>button]:z-20" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {navOpen ? <IconRail inSheet /> : null}
            </SheetContent>
          </Sheet>
        )}
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
        {(talkSurface || path === "/inbox") && (
          <DeferUntilIdle>
            <SeasonalEffects />
          </DeferUntilIdle>
        )}
        <DeferUntilIdle>
          <SupportNotificationScope>
          <BreakEndingAlert />
          </SupportNotificationScope>
        </DeferUntilIdle>
        <DeferUntilIdle>
          <SupportNotificationScope>
          <ShiftStartEndAlert />
          </SupportNotificationScope>
        </DeferUntilIdle>
        <DeferUntilIdle>
          <SupportNotificationScope>
          <EarlyFinishAlert />
          </SupportNotificationScope>
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

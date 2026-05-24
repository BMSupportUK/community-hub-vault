import { createFileRoute, Outlet, redirect, useRouterState, Navigate, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Shield, ShieldCheck, Menu, Receipt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { IconRail } from "@/components/app/IconRail";
import { Clocks } from "@/components/app/Clocks";
import { MyWorkingStatus } from "@/components/app/MyWorkingStatus";
import { BreakEndingAlert } from "@/components/app/BreakEndingAlert";
import { ShiftStartEndAlert } from "@/components/app/ShiftStartEndAlert";
import { TwoFactorPill } from "@/components/app/TwoFactorBanner";
import { SubscriptionExpiry } from "@/components/app/SubscriptionExpiry";
import { ModerationPendingBadge } from "@/components/app/ModerationPendingBadge";
import { PendingOrdersBadge } from "@/components/app/PendingOrdersBadge";
import { logMyIp } from "@/lib/ip-log.functions";
import { useOnlineUsers } from "@/hooks/use-online-users";
import { GpsCapture } from "@/components/app/GpsCapture";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
  const { loading, isPending, isBanned, isRejected, isMod, hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
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
  // Broadcast this user's presence globally while signed in.
  useOnlineUsers();

  useEffect(() => {
    if (loading || isPending || loggedRef.current) return;
    loggedRef.current = true;
    logIp().catch(() => {
      loggedRef.current = false;
    });
  }, [loading, isPending, logIp]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  }

  // Banned users are locked to /banned
  if (isBanned && !path.startsWith("/banned")) {
    return <Navigate to="/banned" />;
  }

  // Rejected users are locked to /account-rejected
  if (isRejected && !path.startsWith("/account-rejected")) {
    return <Navigate to="/account-rejected" />;
  }

  // Pending users are locked to /gate
  if (isPending && !path.startsWith("/gate")) {
    return <Navigate to="/gate" />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <IconRail />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 lg:px-4 gap-1.5 lg:gap-3 overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger
                className="lg:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-surface-2 text-muted-foreground"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-auto bg-rail border-r border-border">
                <IconRail inSheet />
              </SheetContent>
            </Sheet>
            {isAdmin && (
              <Link
                to="/admin"
                title="Admin dashboard"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <LayoutDashboard className="size-4" />
                <span className="hidden xl:inline">Admin dashboard</span>
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
                <ModerationPendingBadge />
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
                <span className="hidden xl:inline">Sales chats</span>
                <PendingOrdersBadge />
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
          </div>
          <div className="hidden xl:flex flex-1 justify-center min-w-0 px-3">
            <SubscriptionExpiry />
          </div>
          <div className="flex items-center gap-1.5 lg:gap-3 shrink-0">
          <div className="hidden lg:flex"><Clocks /></div>
            <MyWorkingStatus />
          <TwoFactorPill />
          </div>
        </header>
        <div className="flex-1 flex min-h-0">
          <Outlet />
        </div>
        <BreakEndingAlert />
        <ShiftStartEndAlert />
        <GpsCapture />
      </div>
    </div>
  );
}

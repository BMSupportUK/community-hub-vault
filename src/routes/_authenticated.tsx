import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Users, Briefcase, LayoutDashboard, Shield, ShieldCheck, Menu, Receipt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { IconRail } from "@/components/app/IconRail";
import { Clocks } from "@/components/app/Clocks";
import { UserAvatarMenu } from "@/components/app/UserAvatarMenu";
import { MyWorkingStatus } from "@/components/app/MyWorkingStatus";
import { BreakEndingAlert } from "@/components/app/BreakEndingAlert";
import { ShiftStartEndAlert } from "@/components/app/ShiftStartEndAlert";
import { SubscriptionExpiry } from "@/components/app/SubscriptionExpiry";
import { ModerationPendingBadge } from "@/components/app/ModerationPendingBadge";
import { PendingOrdersBadge } from "@/components/app/PendingOrdersBadge";
import { logMyIp } from "@/lib/ip-log.functions";
import { useOnlineUsers } from "@/hooks/use-online-users";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } as never });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, isPending, isBanned, isRejected, isMod, hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const logIp = useServerFn(logMyIp);
  const loggedRef = useRef(false);
  const [navOpen, setNavOpen] = useState(false);
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
        <header className="h-12 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-2 md:px-4 gap-2 md:gap-3 overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-2 shrink-0">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger
                className="md:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-surface-2 text-muted-foreground"
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
                <span className="hidden sm:inline">Admin dashboard</span>
              </Link>
            )}
            {isMod && (
              <Link
                to="/moderation"
                title="Moderation"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <Shield className="size-4" />
                <span className="hidden sm:inline">Moderation</span>
                <ModerationPendingBadge />
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/shop"
                search={{ view: "orders" } as any}
                title="Sales chats"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
                onClick={(e) => {
                  if (!isAdminUnlocked(user?.id)) {
                    e.preventDefault();
                    window.location.href = "/admin?next=" + encodeURIComponent("/shop?view=orders");
                  }
                }}
              >
                <Receipt className="size-4" />
                <span className="hidden sm:inline">Sales chats</span>
                <PendingOrdersBadge />
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin-roles"
                title="User roles"
                className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-surface-2 hover:bg-primary hover:text-primary-foreground text-xs font-medium transition-colors"
              >
                <ShieldCheck className="size-4" />
                <span className="hidden sm:inline">User roles</span>
              </Link>
            )}
          </div>
          <div className="hidden md:flex flex-1 justify-center min-w-0 px-3">
            <SubscriptionExpiry />
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <Link
            to="/members"
            title="Members directory"
            className="group flex items-center gap-2 rounded-full px-3 py-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-xs font-medium shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 transition-shadow"
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">Members</span>
          </Link>
          <Link
            to="/staff"
            title="Staff directory"
            className="group flex items-center gap-2 rounded-full px-3 py-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-xs font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-shadow"
          >
            <Briefcase className="size-4" />
            <span className="hidden sm:inline">Staff</span>
          </Link>
          <Clocks />
            <MyWorkingStatus />
          <UserAvatarMenu />
          </div>
        </header>
        <div className="flex-1 flex min-h-0">
          <Outlet />
        </div>
        <BreakEndingAlert />
        <ShiftStartEndAlert />
      </div>
    </div>
  );
}

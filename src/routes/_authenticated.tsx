import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Users, Briefcase, LayoutDashboard, Shield, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { IconRail } from "@/components/app/IconRail";
import { Clocks } from "@/components/app/Clocks";
import { UserAvatarMenu } from "@/components/app/UserAvatarMenu";
import { BreakEndingAlert } from "@/components/app/BreakEndingAlert";
import { ShiftStartEndAlert } from "@/components/app/ShiftStartEndAlert";
import { logMyIp } from "@/lib/ip-log.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } as never });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, isPending, isBanned, isMod, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const logIp = useServerFn(logMyIp);
  const loggedRef = useRef(false);

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

  // Rejected/banned users are locked to /rejected
  if (isBanned && !path.startsWith("/rejected")) {
    return <Navigate to="/rejected" />;
  }

  // Pending users are locked to /gate
  if (isPending && !path.startsWith("/gate")) {
    return (
      <div className="min-h-screen flex">
        <IconRail />
        <div className="flex-1 grid place-items-center text-center px-8">
          <div className="max-w-md">
            <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center mx-auto mb-4">🔒</div>
            <h1 className="font-display text-2xl font-bold">Awaiting approval</h1>
            <p className="text-muted-foreground mt-2">Head to the security gate to chat with a moderator.</p>
            <Link to="/gate" search={{ chat: 1 } as never} className="mt-6 inline-flex px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium">Request access</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <IconRail />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-3">
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

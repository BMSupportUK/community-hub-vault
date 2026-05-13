import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { IconRail } from "@/components/app/IconRail";
import { Clocks } from "@/components/app/Clocks";
import { logMyIp } from "@/lib/ip-log.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } as never });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, isPending } = useAuth();
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
            <a href="/gate" className="mt-6 inline-flex px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium">Open gate</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <IconRail />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-border bg-rail/40 backdrop-blur flex items-center justify-end px-4 gap-3">
          <Link
            to="/members"
            title="Members directory"
            className="group flex items-center gap-2 rounded-full px-3 py-1.5 bg-gradient-to-r from-fuchsia-600 via-violet-600 to-blue-600 text-white text-xs font-medium shadow-lg shadow-fuchsia-500/20 hover:shadow-fuchsia-500/40 transition-shadow"
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">Members</span>
          </Link>
          <Clocks />
        </header>
        <div className="flex-1 flex min-h-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { IconRail } from "@/components/app/IconRail";

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
      <Outlet />
    </div>
  );
}

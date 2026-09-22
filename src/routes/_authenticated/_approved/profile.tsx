import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/profile")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? (search.tab as string) : undefined,
  }),
  component: MyProfileRedirect,
});

function MyProfileRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      const u = data?.username;
      if (u) navigate({ to: "/u/$username", params: { username: u }, search: search.tab ? { tab: search.tab } : undefined, replace: true });
      else navigate({ to: "/home", replace: true });
    })();
  }, [user, navigate, search.tab]);

  return (
    <main className="flex-1 grid place-items-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </main>
  );
}
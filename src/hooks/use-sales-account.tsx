import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** True when the signed-in user owns at least one app login (a sales account). Guests without one must unlock the portal. */
export function useHasSalesAccount() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["has-sales-account", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await supabase.from("app_credentials").select("id", { count: "exact", head: true }).eq("owner_id", user!.id);
      return (count ?? 0) > 0;
    },
  });
  return data === true;
}

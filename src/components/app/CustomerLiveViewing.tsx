import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LIVE_WINDOW_MS } from "@/lib/player-live";

/** One shared poll for all customer cards; each subscription selects its own devices. */
export function CustomerLiveViewing({ userId, accountId }: { userId: string; accountId?: string | null }) {
  const { data, isError } = useQuery({
    queryKey: ["customer-card-live-viewing"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("player_devices")
        .select("id,user_id,offsite_customer_id,credential_id,watching_title,watching_category,watching_preview,last_seen_at")
        .eq("watching_preview", false).not("watching_title", "is", null)
        .gte("last_seen_at", new Date(Date.now() - LIVE_WINDOW_MS).toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });
  const devices = (data ?? []).filter(device =>
    (device.user_id === userId || device.offsite_customer_id === userId) &&
    (!accountId || device.credential_id === accountId));
  return <div className="min-w-0 border-t border-border pt-2 text-sm">
    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Watching now</div>
    {isError ? <p className="text-xs text-muted-foreground">Viewing status unavailable</p> : !data ? <p className="text-xs text-muted-foreground">Loading…</p> : devices.length ? devices.map(device =>
      <div key={device.id} className="mt-1 min-w-0">
        <p className="break-words font-semibold text-success">{device.watching_title}</p>
        <p className="break-words text-xs text-muted-foreground">{device.watching_category || "No category"}</p>
      </div>) : <p className="text-xs text-muted-foreground">Not watching</p>}
  </div>;
}
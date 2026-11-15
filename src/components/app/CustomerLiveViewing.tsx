import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatElapsed, LIVE_WINDOW_MS } from "@/lib/player-live";
import { Tv } from "lucide-react";
import { cn } from "@/lib/utils";

/** One shared poll for all customer cards; each subscription selects its own devices. */
export function CustomerLiveViewing({ userId, accountId, member = false }: { userId: string; accountId?: string | null; member?: boolean }) {
  const { data, isError } = useQuery({
    queryKey: member ? ["member-live-viewing", userId, accountId] : ["customer-card-live-viewing"],
    enabled: !member || Boolean(userId && accountId),
    refetchInterval: 15000,
    queryFn: async () => {
      let query = supabase.from("player_devices")
        .select("id,user_id,offsite_customer_id,credential_id,watching_title,watching_category,watching_preview,last_seen_at,platform,name,nickname,watching_kind,watching_player,watching_since,net_ping_ms")
        .eq("watching_preview", false).not("watching_title", "is", null)
        .gte("last_seen_at", new Date(Date.now() - LIVE_WINDOW_MS).toISOString());
      if (member && accountId) query = query.eq("user_id", userId).eq("credential_id", accountId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const devices = (data ?? []).filter(device =>
    (device.user_id === userId || device.offsite_customer_id === userId) &&
    (!accountId || device.credential_id === accountId));
  return <section aria-label={member ? "Stream information" : "Watching now"} className={cn("min-w-0 border-t border-border pt-2 text-sm", member && "text-primary-foreground [&_p]:text-inherit [&_.stream-secondary]:opacity-80")}>
    <div className={cn("font-semibold", member ? "flex items-center gap-2 text-sm" : "text-[10px] uppercase text-muted-foreground")}>{member && <Tv className="size-4 shrink-0" />}{member ? "Stream information" : "Watching now"}</div>
    {isError ? <p className="text-xs text-muted-foreground">Viewing status unavailable</p> : !data ? <p className="text-xs text-muted-foreground">Loading…</p> : devices.length ? devices.map(device =>
      <div key={device.id} className="mt-1 min-w-0">
        <p className="break-words font-semibold text-success">{device.watching_title}</p>
        <p className="stream-secondary break-words text-xs text-muted-foreground">{device.watching_category || "No category"}</p>
        {member && <dl className="stream-secondary mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt>Device</dt><dd className="break-words">{device.nickname || device.name || device.platform}</dd>
          <dt>Watching</dt><dd>{device.watching_kind === "live" ? "Live TV" : device.watching_kind === "vod" ? "Movie" : device.watching_kind === "series" ? "Series" : device.watching_kind === "catchup" ? "Catch up" : device.watching_kind || "—"}</dd>
          <dt>Player</dt><dd className="break-words">{device.watching_player || "BM Player"}</dd>
          <dt>Playing for</dt><dd>{formatElapsed(device.watching_since)}</dd>
          <dt>Stream connection</dt><dd>{device.net_ping_ms !== null ? `${device.net_ping_ms} ms` : "Not reported"}</dd>
        </dl>}
      </div>) : <p className="text-xs text-muted-foreground">Not watching</p>}
  </section>;
}
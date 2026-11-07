import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logRange, LOG_DAYS, watchedConnections } from "@/lib/player-connection-log";

type LogRow = {
  id: string; device_id: string; user_id: string | null; platform: string | null; iptv_username: string | null;
  watching_kind: string | null; watching_title: string | null; watching_category: string | null; preview: boolean;
  started_at: string; last_seen_at: string; last_ip: string | null; geo_city: string | null; geo_country: string | null; vpn_status: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PLATFORM: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Phone", windows: "Windows", mac: "Mac" };
const KIND: Record<string, string> = { live: "Live TV", film: "Movie", catchup: "Catch up", series: "Series", episode: "Series" };
const mins = (a: string, b: string) => {
  const m = Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/** Past BM Player playback sessions, kept for 30 days (cleared nightly). */
export function PlayerConnectionLog({ userId }: { userId?: string }) {
  const today = new Date();
  const earliest = new Date(today.getTime() - LOG_DAYS * 86400000);
  const years = [...new Set([earliest.getFullYear(), today.getFullYear()])];
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState<number | "all">(today.getMonth());
  const [day, setDay] = useState<Date | undefined>();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const months = useMemo(() => MONTHS.map((n, i) => ({ n, i })).filter(({ i }) => {
    const start = new Date(year, i, 1), end = new Date(year, i + 1, 1);
    return end > earliest && start <= today;
  }), [year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let stop = false;
    setRows(null);
    setError(null);
    const { from, to } = logRange({ year, month, day, now: Date.now() });
    let query = supabase.from("player_connection_log")
      .select("id, device_id, user_id, platform, iptv_username, watching_kind, watching_title, watching_category, preview, started_at, last_seen_at, last_ip, geo_city, geo_country, vpn_status")
      .or("preview.eq.false,preview.is.null")
      .gte("started_at", from.toISOString()).lt("started_at", to.toISOString())
      .order("started_at", { ascending: false }).limit(500);
    if (userId) query = query.eq("user_id", userId);
    void query.then(async ({ data, error: queryError }) => {
        if (stop) return;
        if (queryError) { setError("Couldn't load connection logs. Please try again."); setRows([]); return; }
        const list = watchedConnections((data ?? []) as LogRow[]);
        setRows(list);
        const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
        if (ids.length) {
          const { data: p } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
          if (!stop) setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.display_name || x.username || "Member"])));
        }
      });
    return () => { stop = true; };
  }, [year, month, day, userId]);

  return (
    <section className="space-y-3 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Playback history</h2>
          <p className="text-xs text-muted-foreground">Everything watched in the last 30 days. Older entries are cleared automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setMonth("all"); setDay(undefined); }}>
            <SelectTrigger className="w-28" aria-label="Year"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => { setMonth(v === "all" ? "all" : Number(v)); setDay(undefined); }}>
            <SelectTrigger className="w-36" aria-label="Month"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {months.map(({ n, i }) => <SelectItem key={i} value={String(i)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("gap-2", !day && "text-muted-foreground")} aria-label="Pick a date">
                <CalendarIcon className="size-4" />{day ? format(day, "d MMM yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={day} defaultMonth={day ?? today}
                onSelect={(d) => { setDay(d); if (d) { setYear(d.getFullYear()); setMonth(d.getMonth()); } }}
                disabled={(d) => d > today || d < new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate())}
                initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {day && <Button variant="ghost" size="icon" aria-label="Clear date" onClick={() => setDay(undefined)}><X className="size-4" /></Button>}
        </div>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0
        ? <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">Nothing was watched in this period.</p>
        : <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Started</th><th className="p-3">Code</th><th className="p-3">Username</th><th className="p-3">Watched</th><th className="p-3">For</th><th className="p-3 max-sm:hidden">Location</th><th className="p-3 max-sm:hidden">IP</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => <tr key={r.id} className="border-b border-border last:border-0 align-top">
                <td className="whitespace-nowrap p-3 tabular-nums">{new Date(r.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="p-3 font-mono font-semibold">{r.device_id.slice(0, 8).toUpperCase()}<div className="font-sans text-xs font-normal text-muted-foreground">{PLATFORM[r.platform ?? ""] ?? r.platform}</div></td>
                <td className="p-3"><div className="font-medium">{r.user_id ? names[r.user_id] ?? "…" : "Not linked"}</div>{r.iptv_username && <div className="text-xs text-muted-foreground">Login: {r.iptv_username}</div>}</td>
                <td className="p-3"><div className="font-medium">{r.watching_title || "—"}</div><div className="text-xs text-muted-foreground">{[KIND[r.watching_kind ?? ""] ?? r.watching_kind, r.preview ? "Preview" : null, r.watching_category].filter(Boolean).join(" · ")}</div></td>
                <td className="p-3 font-mono tabular-nums">{mins(r.started_at, r.last_seen_at)}</td>
                <td className="p-3 text-xs max-sm:hidden">{[r.geo_city, r.geo_country].filter(Boolean).join(", ") || "Unknown"}{r.vpn_status === "yes" && <span className="ml-1 font-medium text-warning">VPN</span>}</td>
                <td className="p-3 font-mono text-xs max-sm:hidden">{r.last_ip ?? "—"}</td>
              </tr>)}
            </tbody>
          </table>
          {rows.length === 500 && <p className="p-3 text-xs text-muted-foreground">Showing the latest 500 — pick a date to narrow it down.</p>}
        </div>}
    </section>
  );
}

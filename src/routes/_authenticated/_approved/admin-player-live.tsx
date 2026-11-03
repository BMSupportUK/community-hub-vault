import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Film, MapPin, MonitorPlay, Radio, ShieldAlert, ShieldCheck, Tv } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatElapsed, isLive, LIVE_WINDOW_MS } from "@/lib/player-live";

export const Route = createFileRoute("/_authenticated/_approved/admin-player-live")({
  component: AdminPlayerLivePage,
  head: () => ({ meta: [
    { title: "BM Player live connections | Owner tools" },
    { name: "description", content: "See every BM Player app online now, what it is playing and for how long." },
    { property: "og:title", content: "BM Player live connections | Owner tools" },
    { property: "og:description", content: "See every BM Player app online now, what it is playing and for how long." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

type Row = {
  id: string; user_id: string | null; platform: string; name: string | null; last_seen_at: string | null;
  connected_since: string | null; iptv_username: string | null; app_version: string | null;
  watching_kind: string | null; watching_title: string | null; watching_category: string | null; watching_player: string | null; watching_since: string | null;
  last_ip: string | null; geo_city: string | null; geo_region: string | null; geo_country: string | null; geo_lat: number | null; geo_lon: number | null;
  vpn_status: string | null; vpn_provider: string | null; vpn_checked_at: string | null;
};

const PLATFORM: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Phone", windows: "Windows" };
type ConnectionReport = { id: string; device_id: string; iptv_username: string | null; active_connections: number; max_connections: number; created_at: string; app_version: string | null };

function AdminPlayerLivePage() {
  const { hasAny, loading } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reports, setReports] = useState<ConnectionReport[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isAdmin) return;
    let stop = false;
    const load = async () => {
      const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      const { data } = await supabase.from("player_devices")
        .select("id, user_id, platform, name, last_seen_at, connected_since, iptv_username, app_version, watching_kind, watching_title, watching_category, watching_player, watching_since, last_ip, geo_city, geo_region, geo_country, geo_lat, geo_lon, vpn_status, vpn_provider, vpn_checked_at")
        .gte("last_seen_at", since).order("connected_since", { ascending: true });
      if (stop) return;
      const list = (data ?? []) as Row[];
      setRows(list);
      const { data: reportData } = await supabase.from("player_connection_reports")
        .select("id, device_id, iptv_username, active_connections, max_connections, created_at, app_version")
        .order("created_at", { ascending: false }).limit(100);
      if (!stop) setReports(reportData ?? []);
      const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
        if (!stop) setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.display_name || x.username || "Member"])));
      }
    };
    void load();
    const poll = setInterval(load, 10_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(poll); clearInterval(tick); };
  }, [isAdmin]);

  const live = useMemo(() => (rows ?? []).filter((r) => isLive(r.last_seen_at, now)), [rows, now]);
  const watching = live.filter((r) => r.watching_since).length;
  const onVpn = live.filter((r) => r.vpn_status === "yes").length;

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin" />;

  return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Owner tools</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">BM Player – Live connections</h1>
        <div className="flex gap-2 text-sm">
          <span className="rounded-full border border-border bg-surface px-3 py-1"><Radio className="mr-1 inline size-3.5 text-primary" />{live.length} online</span>
          <span className="rounded-full border border-border bg-surface px-3 py-1"><MonitorPlay className="mr-1 inline size-3.5 text-primary" />{watching} watching</span>
          {onVpn > 0 && <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 font-medium text-warning"><ShieldAlert className="mr-1 inline size-3.5" />{onVpn} on VPN</span>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Updates every few seconds. Apps check in about once a minute; older apps (before 2.35) show as online but can't report what they're playing.</p>

      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : live.length === 0
        ? <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">No BM Player apps are connected right now.</p>
        : <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Code</th><th className="p-3">Username</th><th className="p-3">Location</th><th className="p-3">VPN</th><th className="p-3">Connected to</th><th className="p-3">Watching for</th><th className="p-3 max-sm:hidden">Online for</th></tr>
            </thead>
            <tbody>
              {live.map((r) => {
                const place = [r.geo_city, r.geo_region, r.geo_country].filter(Boolean).join(", ");
                const map = r.geo_lat != null && r.geo_lon != null ? `https://www.google.com/maps?q=${r.geo_lat},${r.geo_lon}` : place ? `https://www.google.com/maps?q=${encodeURIComponent(place)}` : null;
                const Icon = r.watching_kind === "live" ? Tv : Film;
                return <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-3 font-mono font-semibold">{r.id.slice(0, 8).toUpperCase()}<div className="font-sans text-xs font-normal text-muted-foreground">{PLATFORM[r.platform] ?? r.platform}{r.app_version ? ` · ${r.app_version}` : ""}</div></td>
                  <td className="p-3"><div className="font-medium">{r.user_id ? names[r.user_id] ?? "…" : "Not linked"}</div>{r.iptv_username && <div className="text-xs text-muted-foreground">Login: {r.iptv_username}</div>}</td>
                  <td className="p-3">{map
                    ? <a href={map} target="_blank" rel="noreferrer" title={`${place || "Location"}${r.last_ip ? ` · IP ${r.last_ip}` : ""}`} className="inline-flex items-center gap-1 text-primary hover:underline"><MapPin className="size-4" /><span className="text-xs">{place || "Map"}</span></a>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={r.last_ip ?? ""}><MapPin className="size-4" />Unknown</span>}</td>
                  <td className="p-3">{r.vpn_status === "yes"
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning" title={`${r.vpn_provider ? `Via ${r.vpn_provider}` : "VPN or proxy"}${r.last_ip ? ` · IP ${r.last_ip}` : ""}`}><ShieldAlert className="size-3.5" />VPN</span>
                    : r.vpn_status === "no"
                      ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`No VPN or proxy found${r.last_ip ? ` on IP ${r.last_ip}` : ""}`}><ShieldCheck className="size-3.5" />None</span>
                      : <span className="text-xs text-muted-foreground" title="VPN not checked yet">—</span>}</td>
                  <td className="p-3">{r.watching_title
                    ? <div className="flex gap-1.5"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><div><div className="font-medium">{r.watching_title}</div><div className="text-xs text-muted-foreground">{[r.watching_kind === "live" ? "Live TV" : r.watching_kind === "film" ? "Film" : "Series", r.watching_category, r.watching_player].filter(Boolean).join(" · ")}</div></div></div>
                    : <span className="text-xs text-muted-foreground">Menus – not playing</span>}</td>
                  <td className="p-3 font-mono tabular-nums">{r.watching_since ? formatElapsed(r.watching_since, now) : "—"}</td>
                  <td className="p-3 font-mono tabular-nums max-sm:hidden">{formatElapsed(r.connected_since ?? r.last_seen_at, now)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
      <section className="border-t border-border pt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-warning" />Connection limit investigations</h2>
        {reports.length === 0 ? <p className="text-sm text-muted-foreground">No connection limit reports.</p> : <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Reported</th><th className="p-3">Code</th><th className="p-3">Login</th><th className="p-3">Connections</th><th className="p-3">Version</th></tr></thead>
            <tbody>{reports.map((report) => <tr key={report.id} className="border-b border-border">
              <td className="p-3">{new Date(report.created_at).toLocaleString("en-GB")}</td>
              <td className="p-3 font-mono">{report.device_id.slice(0, 8).toUpperCase()}</td>
              <td className="p-3">{report.iptv_username || "Unknown"}</td>
              <td className="p-3 font-semibold text-warning">{report.active_connections} / {report.max_connections}</td>
              <td className="p-3">{report.app_version || "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>
  </main>;
}

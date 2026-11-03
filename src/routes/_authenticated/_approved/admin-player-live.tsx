import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, Copy, Film, Info, MapPin, MonitorPlay, Radio, ShieldAlert,
  ShieldCheck, Tv,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatElapsed, isLive, LIVE_WINDOW_MS } from "@/lib/player-live";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  linked_at: string | null; created_at: string | null; offsite_customer_id: string | null;
  unlock_failures: number | null; unlock_locked_until: string | null;
};

const DEVICE_SELECT = "id, user_id, platform, name, last_seen_at, connected_since, iptv_username, app_version, watching_kind, watching_title, watching_category, watching_player, watching_since, last_ip, geo_city, geo_region, geo_country, geo_lat, geo_lon, vpn_status, vpn_provider, vpn_checked_at, linked_at, created_at, offsite_customer_id, unlock_failures, unlock_locked_until";

const PLATFORM: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Phone", windows: "Windows", mac: "Mac" };
type ConnectionReport = { id: string; device_id: string; iptv_username: string | null; active_connections: number; max_connections: number; created_at: string; app_version: string | null };

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB") : "—");

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border py-2 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{value ?? "—"}</div>
    </div>
  );
}

function CopyValue({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="break-all font-mono text-sm">{text}</span>
      <button
        type="button"
        title="Copy"
        onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-3.5" />
      </button>
      {copied && <span className="text-xs text-primary">Copied</span>}
    </span>
  );
}

function ConnectionDetailsDialog({ row, names, now, onOpenChange }: { row: Row | null; names: Record<string, string>; now: number; onOpenChange: (open: boolean) => void }) {
  const place = [row?.geo_city, row?.geo_region, row?.geo_country].filter(Boolean).join(", ");
  const coords = row?.geo_lat != null && row?.geo_lon != null ? `${row.geo_lat.toFixed(4)}, ${row.geo_lon.toFixed(4)}` : null;
  const map = coords ? `https://www.google.com/maps?q=${row!.geo_lat},${row!.geo_lon}` : place ? `https://www.google.com/maps?q=${encodeURIComponent(place)}` : null;
  const vpn = row?.vpn_status === "yes" ? "Yes" : row?.vpn_status === "no" ? "No" : "Not checked";

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Connection details
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs font-normal">{row?.id.slice(0, 8).toUpperCase()}</span>
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-normal">{row ? PLATFORM[row.platform] ?? row.platform : ""}</span>
          </DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Device</h3>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Field label="Device code" value={<CopyValue text={row.id} />} />
                <Field label="Device name" value={row.name || "—"} />
                <Field label="Platform" value={PLATFORM[row.platform] ?? row.platform} />
                <Field label="App version" value={row.app_version || "—"} />
                <Field label="First added" value={when(row.created_at)} />
                <Field label="Linked" value={when(row.linked_at)} />
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</h3>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Field label="Member" value={row.user_id ? names[row.user_id] ?? "…" : "Not linked"} />
                <Field label="App login" value={row.iptv_username ? <CopyValue text={row.iptv_username} /> : "—"} />
                {row.offsite_customer_id && <Field label="Off-site customer" value={<span className="font-mono text-xs">{row.offsite_customer_id}</span>} />}
                <Field label="Unlock failures" value={String(row.unlock_failures ?? 0)} />
                <Field label="Unlock locked until" value={row.unlock_locked_until ? when(row.unlock_locked_until) : "Not locked"} />
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">IP and location</h3>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Field label="IP address" value={row.last_ip ? <CopyValue text={row.last_ip} /> : "Not recorded"} />
                <Field label="Location" value={place || "Unknown"} />
                <Field label="Coordinates" value={coords ?? "—"} />
                <Field label="Map" value={map ? <a href={map} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><MapPin className="size-3.5" />Open in Google Maps</a> : "—"} />
                <Field label="VPN or proxy" value={row.vpn_status === "yes"
                  ? <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"><ShieldAlert className="size-3.5" />Yes</span>
                  : row.vpn_status === "no"
                    ? <span className="inline-flex items-center gap-1 text-xs"><ShieldCheck className="size-3.5" />No</span>
                    : "Not checked"} />
                <Field label="VPN provider" value={row.vpn_provider || "—"} />
                <Field label="VPN checked" value={when(row.vpn_checked_at)} />
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">This session</h3>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Field label="Connected since" value={when(row.connected_since)} />
                <Field label="Online for" value={formatElapsed(row.connected_since ?? row.last_seen_at, now)} />
                <Field label="Last check-in" value={`${when(row.last_seen_at)} (${formatElapsed(row.last_seen_at, now)} ago)`} />
                <Field label="Playing" value={row.watching_title
                  ? `${row.watching_kind === "live" ? "Live TV" : row.watching_kind === "film" ? "Film" : "Series"} · ${row.watching_title}`
                  : "Menus – not playing"} />
                <Field label="Category" value={row.watching_category || "—"} />
                <Field label="Player" value={row.watching_player || "—"} />
                <Field label="Playing for" value={row.watching_since ? formatElapsed(row.watching_since, now) : "—"} />
              </div>
            </section>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminPlayerLivePage() {
  const { hasAny, loading } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reports, setReports] = useState<ConnectionReport[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let stop = false;
    const load = async () => {
      const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      const { data } = await supabase.from("player_devices")
        .select(DEVICE_SELECT)
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
      <p className="text-xs text-muted-foreground">Updates every few seconds. Apps check in about once a minute; older apps (before 2.35) show as online but can't report what they're playing. Press Details on any row for its full IP and connection record.</p>

      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : live.length === 0
        ? <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">No BM Player apps are connected right now.</p>
        : <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Code</th><th className="p-3">Username</th><th className="p-3">Location</th><th className="p-3">VPN</th><th className="p-3">Connected to</th><th className="p-3">Watching for</th><th className="p-3 max-sm:hidden">Online for</th><th className="p-3">Details</th></tr>
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
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setDetailsId(r.id)} className="gap-1.5 whitespace-nowrap">
                      <Info className="size-3.5" />Details
                    </Button>
                  </td>
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
    <ConnectionDetailsDialog
      row={detailsId ? (rows ?? []).find((r) => r.id === detailsId) ?? null : null}
      names={names}
      now={now}
      onOpenChange={(open) => !open && setDetailsId(null)}
    />
  </main>;
}

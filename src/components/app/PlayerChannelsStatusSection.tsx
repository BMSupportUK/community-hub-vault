import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listPlayerChannels } from "@/lib/player-channels.functions";
import { channelKey, channelStatus, type ChannelStatus } from "@/lib/player-channel-health";

type Row = { channel_key: string; channel_name: string; problem: string | null; last_problem_at: string | null; last_ok_at: string | null };
const PAGE = 100;
const PILL: Record<ChannelStatus, { label: string; cls: string }> = {
  online: { label: "Online", cls: "bg-success/15 text-success border-success/40" },
  offline: { label: "Offline", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  unchecked: { label: "Not checked", cls: "bg-muted text-muted-foreground border-border" },
};
const ago = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/** Every playlist channel with Online / Offline / Not checked from player reports and report-triggered checks. */
export function PlayerChannelsStatusSection() {
  const list = useServerFn(listPlayerChannels);
  const [channels, setChannels] = useState<{ name: string; category: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Map<string, Row>>(new Map());
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [offlineOnly, setOfflineOnly] = useState(false), [page, setPage] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void list().then((r) => { setChannels(r.channels); setError(r.error); }).catch(() => { setChannels([]); setError("Couldn't load the channel list."); });
    const loadHealth = async () => {
      const { data } = await supabase.from("player_channel_health").select("channel_key, channel_name, problem, last_problem_at, last_ok_at");
      setHealth(new Map(((data ?? []) as Row[]).map((r) => [r.channel_key, r]))); setNow(Date.now());
    };
    void loadHealth();
    const t = setInterval(loadHealth, 60_000);
    return () => clearInterval(t);
  }, [list]);

  const rows = useMemo(() => (channels ?? []).map((c) => {
    const h = health.get(channelKey(c.name));
    return { ...c, h, status: channelStatus(h, now) };
  }), [channels, health, now]);
  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b)), [rows]);
  const totals = useMemo(() => rows.reduce((t, r) => { t[r.status]++; return t; }, { online: 0, offline: 0, unchecked: 0 } as Record<ChannelStatus, number>), [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!cat || r.category === cat) && (!offlineOnly || r.status === "offline") && (!s || r.name.toLowerCase().includes(s)));
  }, [rows, q, cat, offlineOnly]);
  useEffect(() => setPage(0), [q, cat, offlineOnly]);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
    <p className="text-xs text-muted-foreground">Offline = a player reported it not working in the last 15 minutes. Online = played cleanly in the last 24 hours. The test login only checks a channel after a report comes in.</p>
    <div className="flex flex-wrap gap-2 text-sm">
      {(["online", "offline", "unchecked"] as ChannelStatus[]).map((s) => <span key={s} className={`rounded-full border px-3 py-1 ${PILL[s].cls}`}>{PILL[s].label}: {totals[s]}</span>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" placeholder="Search channels" value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="rounded-md border border-input bg-background px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
        <option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button variant={offlineOnly ? "default" : "outline"} onClick={() => setOfflineOnly((v) => !v)}>Offline only</Button>
    </div>
    {channels === null ? <p className="text-sm text-muted-foreground">Loading channels…</p>
      : error && !channels.length ? <p className="text-sm text-destructive">{error}</p>
      : <>
        <ul className="divide-y divide-border">{shown.map((r, i) => <li key={`${r.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0"><div className="truncate font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.category}{r.status === "offline" && r.h ? ` · ${r.h.problem ?? "Keeps cutting out"} · ${ago(r.h.last_problem_at)}` : r.status === "online" && r.h ? ` · Last OK ${ago(r.h.last_ok_at)}` : ""}</div></div>
          <span className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium ${PILL[r.status].cls}`}>{PILL[r.status].label}</span>
        </li>)}</ul>
        {!filtered.length && <p className="text-sm text-muted-foreground">No channels match.</p>}
        {pages > 1 && <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages} · {filtered.length} channels</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>}
      </>}
  </section>;
}

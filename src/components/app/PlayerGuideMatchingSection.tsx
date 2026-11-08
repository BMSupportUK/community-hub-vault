import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { feedsFor, COUNTRY_FEEDS } from "@/lib/real-epg";

type Row = { channel_key: string; channel_name: string; category: string; feed: string | null; epg_id: string | null; epg_name: string | null; manual: boolean; disabled: boolean };
type Feed = { code: string; imported_at: string | null; channels: number; matched: number; programmes: number; error: string | null };
const PAGE = 50;

/** Admin: which real TV guide channel each playlist channel uses, with manual fixes. */
export function PlayerGuideMatchingSection() {
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0);
  const [q, setQ] = useState(""), [country, setCountry] = useState(""), [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true), [feeds, setFeeds] = useState<Feed[]>([]);
  const [editing, setEditing] = useState<string | null>(null), [find, setFind] = useState(""), [options, setOptions] = useState<{ feed: string; epg_id: string; name: string }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => { void supabase.from("epg_feeds").select("*").order("code").then(({ data }) => setFeeds((data as Feed[]) ?? [])); }, []);
  useEffect(() => {
    setLoading(true);
    let qb = supabase.from("epg_channel_map").select("channel_key, channel_name, category, feed, epg_id, epg_name, manual, disabled", { count: "exact" });
    if (q.trim()) qb = qb.ilike("channel_name", `%${q.trim()}%`);
    if (country) qb = qb.ilike("category", `${country} |%`);
    if (missing) qb = qb.is("epg_id", null);
    void qb.order("category").order("channel_name").range(page * PAGE, page * PAGE + PAGE - 1).then(({ data, count }) => {
      setRows((data as Row[]) ?? []); setTotal(count ?? 0); setLoading(false);
    });
  }, [q, country, missing, page, tick]);

  const editRow = rows.find((r) => r.channel_key === editing);
  useEffect(() => {
    if (!editRow || find.trim().length < 2) { setOptions([]); return; }
    const fs = feedsFor(editRow.channel_name, editRow.category);
    void supabase.from("epg_feed_channels").select("feed, epg_id, name").in("feed", fs.length ? fs : ["UK1"]).ilike("name", `%${find.trim()}%`).limit(20)
      .then(({ data }) => setOptions(data ?? []));
  }, [find, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(key: string, patch: Partial<Row>, msg: string) {
    const { error } = await supabase.from("epg_channel_map").update({ ...patch, updated_at: new Date().toISOString() }).eq("channel_key", key);
    if (error) toast.error(error.message); else { toast.success(msg); setTick((t) => t + 1); }
  }

  const matched = feeds.reduce((s, f) => s + f.matched, 0);
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
    <div>
      <h2 className="font-display font-semibold">Real TV guide matching</h2>
      <p className="text-sm text-muted-foreground">BM Player shows these published TV guides instead of the playlist's own guide. Sports Pass and event-only channels use the website Sports Guide. Channels with no match keep the playlist's guide. Guides refresh about every 6 hours; fixes apply in apps within 15 minutes.</p>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      {feeds.map((f) => <span key={f.code} className={`rounded-full border px-2 py-1 ${f.error ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`} title={f.error ?? `${f.programmes} programmes`}>
        {f.code}: {f.matched} matched{f.imported_at ? ` · ${new Date(f.imported_at).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : ""}{f.error ? " · failed" : ""}
      </span>)}
      {!feeds.length && <span className="text-muted-foreground">No guides imported yet.</span>}
      {!!feeds.length && <span className="px-2 py-1 font-medium">{matched} channels matched</span>}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search channels" aria-label="Search channels" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
      <select aria-label="Country" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }}>
        <option value="">All countries</option>
        {Object.keys(COUNTRY_FEEDS).sort().map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm"><Switch checked={missing} onCheckedChange={(v) => { setMissing(v); setPage(0); }} />No match only</label>
    </div>
    {loading ? <Loader2 className="animate-spin text-muted-foreground" /> : <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Channel</th><th className="hidden py-2 pr-3 sm:table-cell">Category</th><th className="py-2 pr-3">Real guide</th><th className="py-2 text-right">Actions</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.channel_key} className="border-t border-border align-top">
          <td className="py-2 pr-3">{r.channel_name}</td>
          <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">{r.category}</td>
          <td className="py-2 pr-3">
            {r.disabled ? <span className="text-muted-foreground">Off – playlist guide</span> : r.epg_name ? <span>{r.epg_name} <span className="text-xs text-muted-foreground">({r.feed}{r.manual ? ", fixed" : ""})</span></span> : <span className="text-muted-foreground">No match – playlist guide</span>}
            {editing === r.channel_key && <div className="mt-2 space-y-1">
              <Input autoFocus placeholder="Type a guide channel name" aria-label="Find guide channel" value={find} onChange={(e) => setFind(e.target.value)} />
              {options.map((o) => <button key={o.feed + o.epg_id} className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2" onClick={() => { setEditing(null); setFind(""); void update(r.channel_key, { feed: o.feed, epg_id: o.epg_id, epg_name: o.name, manual: true, disabled: false }, "Guide match saved"); }}>{o.name} <span className="text-xs text-muted-foreground">{o.feed}</span></button>)}
            </div>}
          </td>
          <td className="py-2 text-right whitespace-nowrap">
            <Button size="sm" variant="outline" onClick={() => { setEditing(editing === r.channel_key ? null : r.channel_key); setFind(""); }}>{editing === r.channel_key ? "Cancel" : "Change"}</Button>{" "}
            <Button size="sm" variant="ghost" onClick={() => void update(r.channel_key, { disabled: !r.disabled }, r.disabled ? "Real guide on" : "Real guide off")}>{r.disabled ? "Turn on" : "Turn off"}</Button>
            {r.manual && <Button size="sm" variant="ghost" aria-label="Back to automatic" title="Back to automatic" onClick={() => void update(r.channel_key, { manual: false, feed: null, epg_id: null, epg_name: null }, "Back to automatic – rematched on next refresh")}><RotateCcw /></Button>}
          </td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="py-4 text-sm text-muted-foreground">No channels.</p>}
    </div>}
    <div className="flex items-center gap-2 text-sm">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
      <span className="text-muted-foreground">{total ? `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}` : "0"}</span>
      <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
    </div>
  </section>;
}

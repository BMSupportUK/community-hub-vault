import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerMemberViewing } from "@/components/app/PlayerMemberViewing";

type Row = { week_start: string; kind: string; hours: number; devices: number };
const KINDS: [string, string][] = [["live", "Live TV"], ["film", "Movies"], ["series", "Series"], ["catchup", "Catch up"]];

/** Weekly playback hours (Mon–Sun, UK time) counted from each player's minute check-ins. */
export function WatchTimeSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data } = await supabase.rpc("player_watch_weekly", { _weeks: 12 });
      if (!stop) setRows((data ?? []) as Row[]);
    };
    void load();
    const poll = setInterval(load, 15_000);
    return () => { stop = true; clearInterval(poll); };
  }, []);
  const weeks = [...new Set((rows ?? []).map((r) => r.week_start))];
  const cell = (w: string, k: string) => rows?.find((r) => r.week_start === w && r.kind === k);
  const total = (w: string) => (rows ?? []).filter((r) => r.week_start === w).reduce((a, r) => a + Number(r.hours), 0);
  return <section className="space-y-5">
    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><MonitorPlay className="size-5 text-primary" />Viewing hours</h2>
    <p className="mb-3 text-xs text-muted-foreground">Hours watched in every BM Player each week (Monday to Sunday, UK time). Counted from 5 November 2026, so earlier weeks show nothing.</p>
    {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : weeks.length === 0
      ? <p className="text-sm text-muted-foreground">No viewing counted yet.</p>
      : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Week starting</th><th className="p-3">Total hours</th>{KINDS.map(([, l]) => <th key={l} className="p-3 max-sm:hidden">{l}</th>)}</tr></thead>
        <tbody>{weeks.map((w) => <tr key={w} className="border-b border-border">
          <td className="p-3">{new Date(w).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
          <td className="p-3 text-lg font-semibold tabular-nums">{total(w).toFixed(1)}</td>
          {KINDS.map(([k]) => { const c = cell(w, k); return <td key={k} className="p-3 tabular-nums max-sm:hidden">{c ? <>{Number(c.hours).toFixed(1)}<span className="ml-1 text-xs text-muted-foreground">· {c.devices} devices</span></> : "—"}</td>; })}
        </tr>)}</tbody>
      </table></div>}
    <PlayerMemberViewing />
  </section>;
}

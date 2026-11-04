import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

type BufferRow = { kind: string; content_name: string; stalls: number; devices: number; reconnects: number; total_stall_seconds: number; last_at: string };
const KIND_LABEL: Record<string, string> = { live: "Live TV", film: "Film", series: "Series", catchup: "Catch up" };

export function BufferingSection() {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<BufferRow[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data } = await supabase.rpc("player_buffer_summary", { _hours: hours });
      if (!stop) setRows((data ?? []) as BufferRow[]);
    };
    setRows(null); void load();
    const poll = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(poll); };
  }, [hours]);
  return <section className="rounded-xl border border-border bg-surface p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-5 text-primary" />Buffering</h2>
      <div className="flex gap-1">
        {[24, 168].map((h) => <Button key={h} size="sm" variant={hours === h ? "default" : "outline"} onClick={() => setHours(h)}>{h === 24 ? "Last 24 hours" : "Last 7 days"}</Button>)}
      </div>
    </div>
    <p className="mb-3 text-xs text-muted-foreground">Channels and titles that stalled most, worst first. Many different devices on one channel usually means a provider problem; one device on many channels usually means that home's internet. Needs BM Player Android 2.90, Windows 0.4.1 or Mac 0.1.15.</p>
    {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0
      ? <p className="text-sm text-muted-foreground">No buffering reported.</p>
      : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Channel / title</th><th className="p-3">Devices</th><th className="p-3">Stalls</th><th className="p-3 max-sm:hidden">Reconnects</th><th className="p-3 max-sm:hidden">Time stalled</th><th className="p-3">Last</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.kind + r.content_name} className="border-b border-border">
          <td className="p-3"><div className="font-medium">{r.content_name || "Unknown"}</div><div className="text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</div></td>
          <td className={`p-3 font-semibold ${r.devices >= 5 ? "text-warning" : ""}`}>{r.devices}</td>
          <td className="p-3">{r.stalls}</td>
          <td className="p-3 max-sm:hidden">{r.reconnects}</td>
          <td className="p-3 font-mono tabular-nums max-sm:hidden">{r.total_stall_seconds >= 60 ? `${Math.floor(r.total_stall_seconds / 60)}m ${r.total_stall_seconds % 60}s` : `${r.total_stall_seconds}s`}</td>
          <td className="p-3 text-xs">{when(r.last_at)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}


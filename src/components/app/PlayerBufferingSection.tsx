import { useEffect, useState } from "react";
import { Activity, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bufferDateRange, type BufferPeriod } from "@/lib/player-buffer-date";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

type BufferRow = { kind: string; content_name: string; stalls: number; devices: number; reconnects: number; total_stall_seconds: number; last_at: string; provider_cuts: number; advert_switches: number; network_drops: number };
const KIND_LABEL: Record<string, string> = { live: "Live TV", film: "Film", series: "Series", catchup: "Catch up" };

export function BufferingSection() {
  const [hours, setHours] = useState(24);
  const [period, setPeriod] = useState<BufferPeriod | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<BufferRow[] | null>(null);
  const currentYear = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric" }).format(new Date()));
  const selectedYear = period?.year ?? currentYear;
  const selectedDate = period?.day !== undefined ? new Date(period.year, (period.month ?? 1) - 1, period.day) : undefined;
  useEffect(() => {
    let stop = false;
    void supabase.rpc("player_buffer_years").then(({ data }) => {
      if (!stop) setYears(data ?? []);
    });
    return () => { stop = true; };
  }, []);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data, error: loadError } = await supabase.rpc("player_buffer_summary", period ? bufferDateRange(period) : { _hours: hours });
      if (!stop) {
        setError(loadError ? "Couldn't load buffering reports. Please try again." : "");
        setRows((data ?? []) as BufferRow[]);
      }
    };
    setRows(null); void load();
    const poll = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(poll); };
  }, [hours, period]);
  return <section className="rounded-xl border border-border bg-surface p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-5 text-primary" />Buffering</h2>
      <div className="flex flex-wrap items-center gap-2">
        {[24, 168].map((h) => <Button key={h} size="sm" variant={!period && hours === h ? "default" : "outline"} onClick={() => { setHours(h); setPeriod(null); }}>{h === 24 ? "Last 24 hours" : "Last 7 days"}</Button>)}
        <Select value={period ? String(period.year) : ""} onValueChange={(value) => setPeriod({ year: Number(value) })}>
          <SelectTrigger aria-label="Buffering year" className="w-28"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>{[...new Set([currentYear, ...years])].sort((a, b) => b - a).map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={period ? String(period.month ?? "year") : ""} onValueChange={(value) => setPeriod({ year: selectedYear, ...(value === "year" ? {} : { month: Number(value) }) })}>
          <SelectTrigger aria-label="Buffering month" className="w-40"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent><SelectItem value="year">Whole year</SelectItem>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index} value={String(index + 1)}>{new Date(2026, index, 1).toLocaleDateString("en-GB", { month: "long" })}</SelectItem>)}</SelectContent>
        </Select>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild><Button size="icon" variant={selectedDate ? "default" : "outline"} aria-label="Pick exact buffering date" title="Pick exact date"><CalendarIcon className="size-4" /></Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate ?? new Date(selectedYear, (period?.month ?? 1) - 1, 1)} captionLayout="dropdown" startMonth={new Date(Math.min(currentYear, ...years), 0)} endMonth={new Date(currentYear, 11)} className="pointer-events-auto" onSelect={(date) => {
              if (!date) return;
              setPeriod({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
              setCalendarOpen(false);
            }} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
    <p className="mb-3 text-xs text-muted-foreground">Channels and titles that stalled most, worst first. Many different devices on one channel usually means a provider problem; one device on many channels usually means that home's internet. Needs BM Player Android 2.90, Windows 0.4.1 or Mac 0.1.15.</p>
    {period && <p className="mb-3 text-sm font-medium">{selectedDate ? selectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : period.month ? new Date(period.year, period.month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : period.year} · UK time</p>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0
      ? <p className="text-sm text-muted-foreground">No buffering reported.</p>
      : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Channel / title</th><th className="p-3">Devices</th><th className="p-3">Stalls</th><th className="p-3">Cause</th><th className="p-3 max-sm:hidden">Reconnects</th><th className="p-3 max-sm:hidden">Time stalled</th><th className="p-3">Last</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.kind + r.content_name} className="border-b border-border">
          <td className="p-3"><div className="font-medium">{r.content_name || "Unknown"}</div><div className="text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</div></td>
          <td className={`p-3 font-semibold ${r.devices >= 5 ? "text-warning" : ""}`}>{r.devices}</td>
          <td className="p-3">{r.stalls}</td>
          <td className="p-3 text-xs"><div className="flex flex-wrap gap-1">{([["Provider cut", r.provider_cuts], ["Advert switch", r.advert_switches], ["Network drop", r.network_drops]] as const).filter(([, n]) => n > 0).map(([label, n]) => <span key={label} className="whitespace-nowrap rounded-full border border-border px-2 py-0.5">{label} {n}</span>)}</div></td>
          <td className="p-3 max-sm:hidden">{r.reconnects}</td>
          <td className="p-3 font-mono tabular-nums max-sm:hidden">{r.total_stall_seconds >= 60 ? `${Math.floor(r.total_stall_seconds / 60)}m ${r.total_stall_seconds % 60}s` : `${r.total_stall_seconds}s`}</td>
          <td className="p-3 text-xs">{when(r.last_at)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}


import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock as ClockIcon, LogIn, LogOut, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type BreakKind, breakLabel, breakIcon } from "@/lib/breaks";

const PAGE_SIZE = 20;
const AUTO_OUT_GRACE_MS = 15 * 60 * 1000;

interface ShiftHistoryRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  end_prompt_asked_at: string | null;
  still_working_ack_at: string | null;
}

interface BreakRow {
  id: string;
  shift_id: string;
  kind: BreakKind;
  started_at: string;
  ended_at: string | null;
}

/** Hourly rota slot a moderator claimed for themselves. */
interface ClaimedSlot {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
}

function fmtSlotDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function slotHours(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = Math.max(0, (eh! * 60 + em!) - (sh! * 60 + sm!));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Monday 00:00 local time of the week containing `now`. */
function weekStart(now = new Date()) {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekEnd(now = new Date()) {
  const d = weekStart(now);
  d.setDate(d.getDate() + 7);
  return d;
}

function fmtRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const last = new Date(end.getTime() - 1);
  return `${start.toLocaleDateString("en-GB", opts)} – ${last.toLocaleDateString("en-GB", { ...opts, year: "numeric" })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}


function fmtDuration(startIso: string, endIso: string | null) {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Pill({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof ClockIcon;
  label: string;
  tone: "ok" | "warn" | "muted" | "info";
}) {
  const tones: Record<string, string> = {
    ok: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
    warn: "bg-amber-500/15 text-amber-200 border-amber-400/40",
    info: "bg-blue-500/15 text-blue-200 border-blue-400/40",
    muted: "bg-purple-500/10 text-purple-200/80 border-purple-400/30",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export default function ShiftHistoryPanel({ userId, name }: { userId: string; name: string }) {
  const [rows, setRows] = useState<ShiftHistoryRow[]>([]);
  const [breaksByShift, setBreaksByShift] = useState<Record<string, BreakRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  // Monday-to-Sunday window; resets automatically when a new week begins.
  const [weekFrom, setWeekFrom] = useState(() => weekStart().getTime());
  const [claimed, setClaimed] = useState<ClaimedSlot[]>([]);

  useEffect(() => {
    const tick = () => {
      const current = weekStart().getTime();
      setWeekFrom((prev) => (prev === current ? prev : current));
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const weekTo = weekEnd(new Date(weekFrom)).getTime();

  // Hourly rota slots this person claimed (moderator cover hours).
  useEffect(() => {
    let cancelled = false;
    const iso = (t: number) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    (async () => {
      const { data } = await supabase
        .from("shift_slots")
        .select("id, shift_date, start_time, end_time, notes")
        .eq("assigned_to", userId)
        .eq("slot_type", "hourly")
        .gte("shift_date", iso(weekFrom))
        .lt("shift_date", iso(weekTo))
        .order("shift_date", { ascending: false })
        .order("start_time", { ascending: true });
      if (!cancelled) setClaimed((data ?? []) as ClaimedSlot[]);
    })();
    return () => { cancelled = true; };
  }, [userId, weekFrom, weekTo]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const { data, error, count } = await supabase
        .from("shifts")
        .select("id, clock_in, clock_out, end_prompt_asked_at, still_working_ack_at", { count: "exact" })
        .eq("user_id", userId)
        .gte("clock_in", new Date(weekFrom).toISOString())
        .lt("clock_in", new Date(weekTo).toISOString())
        .order("clock_in", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return { rows: [] as ShiftHistoryRow[], count: 0 };
      return { rows: (data ?? []) as ShiftHistoryRow[], count: count ?? 0 };
    },
    [userId, weekFrom, weekTo],
  );


  const fetchBreaks = useCallback(async (shiftIds: string[]) => {
    if (shiftIds.length === 0) return {} as Record<string, BreakRow[]>;
    const { data } = await supabase
      .from("breaks")
      .select("id, shift_id, kind, started_at, ended_at")
      .in("shift_id", shiftIds)
      .order("started_at", { ascending: true });
    const map: Record<string, BreakRow[]> = {};
    for (const b of (data ?? []) as BreakRow[]) {
      (map[b.shift_id] ??= []).push(b);
    }
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setBreaksByShift({});
    fetchPage(0).then(async ({ rows: first, count }) => {
      const bmap = await fetchBreaks(first.map((r) => r.id));
      if (cancelled) return;
      setRows(first);
      setBreaksByShift(bmap);
      setTotal(count);
      setHasMore(first.length === PAGE_SIZE && count > first.length);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, fetchBreaks]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { rows: next, count } = await fetchPage(rows.length);
    const bmap = await fetchBreaks(next.map((r) => r.id));
    setBreaksByShift((prev) => ({ ...prev, ...bmap }));
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const merged = [...prev, ...next.filter((r) => !seen.has(r.id))];
      setHasMore(next.length === PAGE_SIZE && count > merged.length);
      return merged;
    });
    setTotal(count);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-purple-500/30 bg-purple-950/50 p-8 text-center text-purple-200/80">
        <Loader2 className="size-5 mx-auto animate-spin mb-2" />
        Loading shift history…
      </div>
    );
  }

  const rangeLabel = fmtRange(new Date(weekFrom), new Date(weekTo));

  const claimedBlock = claimed.length > 0 ? (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-white">Claimed hours</h4>
        <span className="text-xs text-amber-200/80">
          {claimed.length} slot{claimed.length === 1 ? "" : "s"} booked this week
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {claimed.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-sm text-white">
            <ClockIcon className="size-4 text-amber-300" />
            <span className="font-medium">{fmtSlotDate(c.shift_date)}</span>
            <span className="ml-auto tabular-nums text-amber-100/90">
              {c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)} · {slotHours(c.start_time, c.end_time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {claimedBlock}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/50 p-8 text-center text-purple-200/80">
          No clocked-in shifts recorded this week ({rangeLabel}).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-white">
          {name}&apos;s shift history
        </h3>
        <p className="text-xs text-purple-200/70">
          This week ({rangeLabel}) · {total ?? rows.length} shift{(total ?? rows.length) === 1 ? "" : "s"} · newest first
        </p>
      </div>

      {claimedBlock}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((s) => {
          const open = !s.clock_out;
          const acked = !!s.still_working_ack_at;
          const autoOut =
            !!s.clock_out &&
            !!s.end_prompt_asked_at &&
            Math.abs(new Date(s.clock_out).getTime() - (new Date(s.end_prompt_asked_at).getTime() + AUTO_OUT_GRACE_MS)) < 60_000;
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-2xl border p-4 text-white shadow-[0_0_40px_-20px_rgba(168,85,247,0.6)]",
                open
                  ? "border-emerald-400/40 bg-emerald-950/30"
                  : "border-purple-500/30 bg-purple-950/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{fmtDate(s.clock_in)}</p>
                  <p className="text-xs text-purple-200/70">
                    {fmtDuration(s.clock_in, s.clock_out)}
                    {open ? " so far" : " worked"}
                  </p>
                </div>
                {open ? (
                  <Pill icon={ClockIcon} label="On shift" tone="ok" />
                ) : autoOut ? (
                  <Pill icon={ClockIcon} label="Auto clocked out" tone="warn" />
                ) : (
                  <Pill icon={ClockIcon} label="Completed" tone="muted" />
                )}
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-purple-100/90">
                  <LogIn className="size-4 text-emerald-300" />
                  <span className="text-purple-200/70">Clocked in</span>
                  <span className="ml-auto font-medium">{fmtTime(s.clock_in)}</span>
                </div>
                <div className="flex items-center gap-2 text-purple-100/90">
                  <LogOut className="size-4 text-rose-300" />
                  <span className="text-purple-200/70">Clocked out</span>
                  <span className="ml-auto font-medium">{s.clock_out ? fmtTime(s.clock_out) : "—"}</span>
                </div>
              </div>

              {(breaksByShift[s.id] ?? []).length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-purple-500/20 pt-2 text-sm">
                  {(breaksByShift[s.id] ?? []).map((b) => {
                    const BIcon = breakIcon(b.kind);
                    return (
                      <div key={b.id} className="flex items-center gap-2 text-purple-100/90">
                        <BIcon className="size-4 text-amber-300" />
                        <span className="text-purple-200/70">{breakLabel(b.kind)}</span>
                        <span className="ml-auto font-medium tabular-nums">
                          {fmtTime(b.started_at)} · {fmtDuration(b.started_at, b.ended_at)}
                          {!b.ended_at ? " (ongoing)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}


              <div className="mt-3 flex flex-wrap gap-2">
                {s.end_prompt_asked_at ? (
                  <Pill icon={HelpCircle} label={`Asked “still working?” at ${fmtTime(s.end_prompt_asked_at)}`} tone="info" />
                ) : (
                  <Pill icon={HelpCircle} label="Never asked" tone="muted" />
                )}
                {acked ? (
                  <Pill icon={CheckCircle2} label={`Said still working at ${fmtTime(s.still_working_ack_at!)}`} tone="ok" />
                ) : s.end_prompt_asked_at ? (
                  <Pill icon={HelpCircle} label="No answer given" tone="warn" />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="border-purple-500/40 bg-purple-950/50 text-white hover:bg-purple-900/60">
            {loadingMore ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            Load more shifts
          </Button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock as ClockIcon, LogIn, LogOut, CheckCircle2, HelpCircle, Loader2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { type BreakKind, breakLabel, breakIcon } from "@/lib/breaks";
import { awayForShift, awayIcon } from "@/lib/staff-away";
import { ShiftBreakdownCard } from "@/components/app/ShiftBreakdownCard";
import { isAutomaticShiftOut, shiftEndSignOutAnswer } from "@/lib/shift-end-history";

const PAGE_SIZE = 20;

interface ShiftHistoryRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  end_prompt_asked_at: string | null;
  still_working_ack_at: string | null;
  early_finish_at?: string | null;
  end_prompt_signed_out_at?: string | null;
}

interface BreakRow {
  id: string;
  shift_id: string;
  kind: BreakKind;
  started_at: string;
  ended_at: string | null;
}

/** One logged Away period, written by the away_log trigger. */
interface AwayRow {
  id: string;
  reason: string;
  starts_at: string;
  ends_at: string | null;
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

/** Local calendar day as YYYY-MM-DD, used to match a shift to the chosen day. */
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Long, unambiguous day label, e.g. "Monday 12 October 2026". */
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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


export default function ShiftHistoryPanel({ userId, name, username }: { userId: string; name: string; username?: string | null }) {
  const [rows, setRows] = useState<ShiftHistoryRow[]>([]);
  const [breaksByShift, setBreaksByShift] = useState<Record<string, BreakRow[]>>({});
  const [awayRows, setAwayRows] = useState<AwayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [claimed, setClaimed] = useState<ClaimedSlot[]>([]);
  // The day being viewed, picked from the calendar.
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);


  // The chosen day's Monday-to-Sunday window: the query always loads the whole
  // week so paging and claimed-hours lookups stay cheap.
  const weekFrom = weekStart(selectedDate).getTime();
  const weekTo = weekEnd(new Date(weekFrom)).getTime();

  const selectedIso = isoDay(selectedDate);
  const isToday = selectedIso === isoDay(new Date());

  const goDay = (delta: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  };


  // Hourly rota slots this person claimed (moderator cover hours).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("shift_slots")
        .select("id, shift_date, start_time, end_time, notes")
        .eq("assigned_to", userId)
        .eq("slot_type", "hourly")
        .gte("shift_date", isoDay(new Date(weekFrom)))
        .lt("shift_date", isoDay(new Date(weekTo)))
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
        .select("id, clock_in, clock_out, end_prompt_asked_at, still_working_ack_at, end_prompt_signed_out_at, early_finish_at", { count: "exact" })
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

  // Away periods for the selected week; matched to each shift when rendering.
  const fetchAway = useCallback(async () => {
    const { data } = await supabase
      .from("away_log")
      .select("id, reason, starts_at, ends_at")
      .eq("user_id", userId)
      .or(`ends_at.is.null,ends_at.gt.${new Date(weekFrom).toISOString()}`)
      .lt("starts_at", new Date(weekTo).toISOString())
      .order("starts_at", { ascending: true });
    return (data ?? []) as AwayRow[];
  }, [userId, weekFrom, weekTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setBreaksByShift({});
    setAwayRows([]);
    fetchPage(0).then(async ({ rows: first, count }) => {
      const bmap = await fetchBreaks(first.map((r) => r.id));
      const away = await fetchAway();
      if (cancelled) return;
      setRows(first);
      setBreaksByShift(bmap);
      setAwayRows(away);
      setTotal(count);
      setHasMore(first.length === PAGE_SIZE && count > first.length);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, fetchBreaks, fetchAway]);

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

  // Shifts and claimed hours for the day chosen in the calendar.
  const filteredRows = rows.filter((r) => isoDay(new Date(r.clock_in)) === selectedIso);
  const dayClaimed = claimed.filter((c) => c.shift_date === selectedIso);


  const claimedBlock = claimed.length > 0 ? (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-white">Claimed hours — {fmtDay(selectedDate)}</h4>
        <span className="text-xs text-amber-200/80">
          {dayClaimed.length} slot{dayClaimed.length === 1 ? "" : "s"} booked
        </span>
      </div>
      {dayClaimed.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {dayClaimed.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-sm text-white">
              <ClockIcon className="size-4 text-amber-300" />
              <span className="font-medium">{fmtSlotDate(c.shift_date)}</span>
              <span className="ml-auto tabular-nums text-amber-100/90">
                {c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)} · {slotHours(c.start_time, c.end_time)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-amber-200/70">No hours booked for this day.</p>
      )}
    </div>
  ) : null;


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-white">
          {name}&apos;s shift history
        </h3>
        <p className="text-xs text-purple-200/70">
          {filteredRows.length} shift{filteredRows.length === 1 ? "" : "s"} on {fmtDay(selectedDate)} · {total ?? rows.length} in the week shown · newest first
        </p>

      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-purple-500/30 bg-purple-950/50 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goDay(-1)}
          className="border-purple-500/40 bg-purple-900/40 text-white hover:bg-purple-800/60"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Previous day</span>
        </Button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-purple-500/40 bg-purple-900/40 text-white hover:bg-purple-800/60"
              aria-label="Choose a day"
            >
              <CalendarDays className="size-4 text-purple-300" />
              {fmtDay(selectedDate)}
              {isToday ? " · today" : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              required
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(date) => {
                if (!date) return;
                setSelectedDate(date);
                setCalendarOpen(false);
              }}
              weekStartsOn={1}
              autoFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goDay(1)}
          className="border-purple-500/40 bg-purple-900/40 text-white hover:bg-purple-800/60"
          aria-label="Next day"
        >
          <span className="hidden sm:inline">Next day</span>
          <ChevronRight className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate(new Date())}
          disabled={isToday}
          className="border-purple-500/40 bg-purple-900/40 text-white hover:bg-purple-800/60 disabled:text-purple-300/50"
        >
          Today
        </Button>
      </div>



      {claimedBlock}

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/50 p-8 text-center text-purple-200/80">
          No shifts on {fmtDay(selectedDate)}.
        </div>
      ) : (
      <div className="grid gap-4">
        {filteredRows.map((s) => {
          const open = !s.clock_out;
          const acked = !!s.still_working_ack_at;
          const autoOut = isAutomaticShiftOut(s);
          const signedOutAnswer = shiftEndSignOutAnswer(s);
          return (
            <div key={s.id} className="grid min-w-0 gap-3 xl:grid-cols-2">
            <div
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
                    {open ? " on shift so far" : " on shift"}
                  </p>
                </div>
                {open ? (
                  <Pill icon={ClockIcon} label="On shift" tone="ok" />
                ) : s.early_finish_at ? (
                  <Pill icon={ClockIcon} label="Early finish" tone="warn" />
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

              {awayForShift(awayRows, s).length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-purple-500/20 pt-2 text-sm">
                  {awayForShift(awayRows, s).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-purple-100/90">
                      {(() => { const Icon = awayIcon(a.reason); return <Icon className="size-4 text-violet-300" />; })()}
                      <span className="text-purple-200/70">Away · {a.reason}</span>
                      <span className="ml-auto font-medium tabular-nums">
                        {fmtTime(a.starts_at)} · {fmtDuration(a.starts_at, a.ends_at)}
                        {!a.ends_at ? " (ongoing)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}


              <div className="mt-3 flex flex-wrap gap-2">
                {s.end_prompt_asked_at ? (
                  <Pill icon={HelpCircle} label={`Asked “still working?” at ${fmtTime(s.end_prompt_asked_at)}`} tone="info" />
                ) : (
                  <Pill icon={HelpCircle} label="Never asked" tone="muted" />
                )}
                {acked ? (
                  <Pill icon={CheckCircle2} label={`Said still working at ${fmtTime(s.still_working_ack_at ?? s.clock_in)}`} tone="ok" />
                ) : null}
                {signedOutAnswer ? (
                  <Pill icon={CheckCircle2} label={`Answered: finished, signed out at ${fmtTime(signedOutAnswer)}`} tone="ok" />
                ) : !acked && s.end_prompt_asked_at ? (
                  <Pill icon={HelpCircle} label="No answer given" tone="warn" />
                ) : null}
              </div>
            </div>
            <ShiftBreakdownCard shift={s} breaks={breaksByShift[s.id] ?? []} away={awayRows} username={username} />
            </div>
          );
        })}
      </div>
      )}


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

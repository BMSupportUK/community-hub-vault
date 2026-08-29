import { useEffect, useMemo, useRef, useState } from "react";
import { Play, StopCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addDaysToDateStr, useTimezone } from "@/hooks/use-timezone";
import shiftStartAudio from "@/assets/shift-start.mp3";
import shiftEndAudio from "@/assets/shift-end.mp3";
import { playSound } from "@/lib/sound";

const WARN_BEFORE = 10 * 60 * 1000; // 10 minutes
const START_OVERDUE_GRACE = 30 * 60 * 1000; // stop nagging 30 min after shift start

interface Slot {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  assigned_to: string | null;
  slot_type: string;
}

interface OpenShift {
  id: string;
  clock_in: string;
  clock_out: string | null;
}

type Stage = "start" | "end";

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function ShiftStartEndAlert() {
  const { user, isStaff } = useAuth();
  const { dateInTimeZone, shiftWindowToUtcMs } = useTimezone();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState<{ slot: Slot; stage: Stage } | null>(null);
  const autoClockedRef = useRef<Set<string>>(new Set());
  const autoEndedRef = useRef<Set<string>>(new Set());
  const [autoEndAt, setAutoEndAt] = useState<number | null>(null);
  const localDate = useMemo(() => dateInTimeZone(now), [dateInTimeZone, now]);

  // Tick every second
  useEffect(() => {
    if (!isStaff) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isStaff]);

  // Re-sync the clock the moment the tab becomes visible / focused so the alert fires immediately.
  useEffect(() => {
    if (!isStaff) return;
    const resync = () => setNow(Date.now());
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, [isStaff]);

  // Load today's assigned shift slots and open shift
  useEffect(() => {
    if (!user || !isStaff) return;
    const load = async () => {
      const today = localDate;
      const fromDate = addDaysToDateStr(today, -1);
      const toDate = addDaysToDateStr(today, 1);

      const [{ data: s }, { data: sh }] = await Promise.all([
        supabase
          .from("shift_slots")
          .select("*")
          .eq("assigned_to", user.id)
          .gte("shift_date", fromDate)
          .lte("shift_date", toDate)
          .eq("slot_type", "shift")
          .order("shift_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("shifts")
          .select("id, clock_in, clock_out")
          .eq("user_id", user.id)
          .is("clock_out", null)
          .order("clock_in", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setSlots((s ?? []) as Slot[]);
      setOpenShift((sh as OpenShift | null) ?? null);
    };
    load();
    const ch = supabase
      .channel(`shift-alerts-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots", filter: `assigned_to=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isStaff, localDate]);

  // Auto clock-in: if a shift has started and the user is not clocked in,
  // create a shift record automatically using the slot's start time.
  useEffect(() => {
    if (!user || !isStaff) return;
    if (openShift) return;
    for (const slot of slots) {
      if (autoClockedRef.current.has(slot.id)) continue;
      const { startsAt, endsAt } = shiftWindowToUtcMs(slot.shift_date, slot.start_time, slot.end_time);
      if (isNaN(startsAt) || isNaN(endsAt)) continue;
      if (now >= startsAt && now < endsAt) {
        autoClockedRef.current.add(slot.id);
        (async () => {
          const { data: existing } = await supabase
            .from("shifts")
            .select("id")
            .eq("user_id", user.id)
            .is("clock_out", null)
            .order("clock_in", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (existing) return;
          await supabase.from("shifts").insert({
            user_id: user.id,
            clock_in: new Date(startsAt).toISOString(),
          });
        })();
        break;
      }
    }
  }, [user, isStaff, slots, openShift, now, shiftWindowToUtcMs]);

  // Determine which warning (if any) should currently be active
  const candidate = useMemo(() => {
    const openShiftClockIn = openShift ? new Date(openShift.clock_in).getTime() : NaN;
    for (const slot of slots) {
      const { startsAt, endsAt } = shiftWindowToUtcMs(slot.shift_date, slot.start_time, slot.end_time);
      if (isNaN(startsAt) || isNaN(endsAt)) continue;

      const toEnd = endsAt - now;
      const isOpenForThisSlot = openShift && !isNaN(openShiftClockIn) && openShiftClockIn <= endsAt && now >= startsAt - WARN_BEFORE;
      if (isOpenForThisSlot && toEnd <= 0) {
        return { slot, stage: "end" as Stage };
      }

      const toStart = startsAt - now;
      if (!openShift) {
        if (toStart <= 0 && now < Math.min(endsAt, startsAt + START_OVERDUE_GRACE)) {
          return { slot, stage: "start" as Stage };
        } else if (toStart > 0 && toStart <= WARN_BEFORE) {
          return { slot, stage: "start" as Stage };
        }
      }
    }
    return null;
  }, [slots, openShift, now, shiftWindowToUtcMs]);

  useEffect(() => {
    if (candidate && (!active || active.slot.id !== candidate.slot.id || active.stage !== candidate.stage)) {
      setActive(candidate);
    } else if (!candidate && active) {
      setActive(null);
    }
  }, [candidate, active]);

  // Play the matching voice clip when a warning first appears for a given slot.
  const playedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active) return;
    const key = `${active.slot.id}:${active.stage}`;
    if (playedRef.current.has(key)) return;
    playedRef.current.add(key);
    const src = active.stage === "start" ? shiftStartAudio : shiftEndAudio;
    playSound(src, { label: `shift-${active.stage}`, gain: 2.2 });
  }, [active]);

  // Render or update the non-blocking warning toast.
  useEffect(() => {
    if (!active) {
      toast.dismiss("shift-start-warning");
      toast.dismiss("shift-end-warning");
      return;
    }
    const { startsAt, endsAt } = shiftWindowToUtcMs(active.slot.shift_date, active.slot.start_time, active.slot.end_time);
    const isStart = active.stage === "start";
    const target = isStart ? startsAt : endsAt;
    const remaining = target - now;
    const overdue = remaining <= 0;
    const toastId = isStart ? "shift-start-warning" : "shift-end-warning";
    const title = isStart
      ? overdue ? "Shift has started" : "Shift starting soon"
      : overdue ? "Shift has ended" : "Shift ending soon";

    const Icon = isStart ? Play : StopCircle;
    const accent = isStart ? "text-emerald-500" : "text-amber-500";

    toast.info(
      <div className="flex items-start gap-3">
        <div className={`grid place-items-center size-10 rounded-full shrink-0 ${isStart ? "bg-emerald-500/15" : "bg-amber-500/15"} ${overdue ? "animate-pulse" : ""}`}>
          <Icon className={`size-5 ${accent}`} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isStart ? (
              overdue ? (
                <>Your shift has started. Please clock in.</>
              ) : (
                <>
                  Your shift starts in{" "}
                  <span className={`font-semibold inline-flex items-center gap-1 ${accent}`}>
                    <Clock className="size-3" /> {fmtCountdown(remaining)}
                  </span>
                  .
                </>
              )
            ) : (
              overdue ? (
                <>Your shift has ended. Please clock out.</>
              ) : (
                <>
                  Your shift ends in{" "}
                  <span className={`font-semibold inline-flex items-center gap-1 ${accent}`}>
                    <Clock className="size-3" /> {fmtCountdown(remaining)}
                  </span>
                  .
                </>
              )
            )}
          </div>
        </div>
      </div>,
      {
        id: toastId,
        duration: Infinity,
        dismissible: true,
        className: isStart ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-amber-500",
      }
    );
  }, [active, now, shiftWindowToUtcMs]);

  // Auto-end shift 30s after the "shift has ended" warning appears
  useEffect(() => {
    if (!active || active.stage !== "end") { setAutoEndAt(null); return; }
    const { endsAt: e } = shiftWindowToUtcMs(active.slot.shift_date, active.slot.start_time, active.slot.end_time);
    if (isNaN(e) || Date.now() < e) { setAutoEndAt(null); return; }
    if (!openShift) { setAutoEndAt(null); return; }
    const target = Date.now() + 30_000;
    setAutoEndAt(target);
    const t = setTimeout(async () => {
      if (autoEndedRef.current.has(openShift.id)) return;
      autoEndedRef.current.add(openShift.id);
      const { data: stillOpen } = await supabase
        .from("shifts")
        .select("id")
        .eq("id", openShift.id)
        .is("clock_out", null)
        .maybeSingle();
      if (!stillOpen) { setActive(null); setAutoEndAt(null); return; }
      await supabase
        .from("shifts")
        .update({ clock_out: new Date(e).toISOString() })
        .eq("id", openShift.id);
      setActive(null);
      setAutoEndAt(null);
    }, 30_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, openShift?.id]);

  return null;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, StopCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addDaysToDateStr, useTimezone } from "@/hooks/use-timezone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
type Phase = "warn" | "overdue";

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function ShiftStartEndAlert() {
  const { user, isStaff } = useAuth();
  const { dateInTimeZone, shiftWindowToUtcMs } = useTimezone();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState<{ slot: Slot; stage: Stage } | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set()); // `${slotId}:${stage}:${phase}`
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
          // Double-check no open shift exists for this user before inserting
          const { data: existing } = await supabase
            .from("shifts")
            .select("id")
            .eq("user_id", user.id)
            .is("clock_out", null)
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

  // Determine which alert (if any) should currently be visible
  const candidate = useMemo(() => {
    const openShiftClockIn = openShift ? new Date(openShift.clock_in).getTime() : NaN;
    for (const slot of slots) {
      const { startsAt, endsAt } = shiftWindowToUtcMs(slot.shift_date, slot.start_time, slot.end_time);
      if (isNaN(startsAt) || isNaN(endsAt)) continue;

      // End: warn before end OR keep showing overdue while still clocked in
      const toEnd = endsAt - now;
      const isOpenForThisSlot = openShift && !isNaN(openShiftClockIn) && openShiftClockIn <= endsAt && now >= startsAt - WARN_BEFORE;
      if (isOpenForThisSlot) {
        if (toEnd <= 0) {
          const key = `${slot.id}:end:overdue`;
          if (!dismissedRef.current.has(key)) return { slot, stage: "end" as Stage };
        }
      }

      // Start: warn before start OR keep showing overdue while not yet clocked in
      const toStart = startsAt - now;
      if (!openShift) {
        // Overdue only for a short grace window after start (don't nag all shift)
        if (toStart <= 0 && now < Math.min(endsAt, startsAt + START_OVERDUE_GRACE)) {
          const key = `${slot.id}:start:overdue`;
          if (!dismissedRef.current.has(key)) return { slot, stage: "start" as Stage };
        } else if (toStart > 0 && toStart <= WARN_BEFORE) {
          const key = `${slot.id}:start:warn`;
          if (!dismissedRef.current.has(key)) return { slot, stage: "start" as Stage };
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

  // Play the matching voice clip when a "start" or "end" dialog first opens for a given slot.
  const playedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active) return;
    const key = `${active.slot.id}:${active.stage}`;
    if (playedRef.current.has(key)) return;
    playedRef.current.add(key);
    const src = active.stage === "start" ? shiftStartAudio : shiftEndAudio;
    playSound(src, { label: `shift-${active.stage}`, gain: 2.2 });
  }, [active]);

  // Auto-end shift 30s after the "shift has ended" overdue dialog appears
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
      dismissedRef.current.add(`${active.slot.id}:end:overdue`);
      setActive(null);
      setAutoEndAt(null);
    }, 30_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, openShift?.id]);

  if (!active) return null;

  const { startsAt, endsAt } = shiftWindowToUtcMs(active.slot.shift_date, active.slot.start_time, active.slot.end_time);
  const isStart = active.stage === "start";
  const target = isStart ? startsAt : endsAt;
  const remaining = target - now;
  const overdue = remaining <= 0;
  const autoRemaining = autoEndAt != null ? Math.max(0, autoEndAt - now) : null;

  const dismiss = () => {
    const phase: Phase = remaining <= 0 ? "overdue" : "warn";
    dismissedRef.current.add(`${active.slot.id}:${active.stage}:${phase}`);
    setActive(null);
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) dismiss(); }}>
      <AlertDialogContent className={isStart ? "border-emerald-500/60" : "border-amber-500/60"}>
        <AlertDialogHeader>
          <div className={`mx-auto mb-2 grid place-items-center size-14 rounded-full ${isStart ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"} ${overdue ? "animate-pulse" : ""}`}>
            {isStart ? <Play className="size-7" /> : <StopCircle className="size-7" />}
          </div>
          <AlertDialogTitle className="text-center text-xl">
            {isStart
              ? overdue ? "Shift has started" : "Shift starting soon"
              : overdue ? "Shift has ended" : "Shift ending soon"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {isStart ? (
              overdue ? (
                <>Your shift has started. Please clock in.</>
              ) : (
                <>
                  Your shift starts in{" "}
                  <span className={`font-semibold inline-flex items-center gap-1 ${isStart ? "text-emerald-500" : "text-amber-500"}`}>
                    <Clock className="size-3.5" /> {fmtCountdown(remaining)}
                  </span>
                  . Head to the clock to start.
                </>
              )
            ) : (
              overdue ? (
                <>Your shift has ended. Please clock out.</>
              ) : (
                <>
                  Your shift ends in{" "}
                  <span className="font-semibold text-amber-500 inline-flex items-center gap-1">
                    <Clock className="size-3.5" /> {fmtCountdown(remaining)}
                  </span>
                  . Don't forget to clock out.
                </>
              )
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-2">
          <AlertDialogCancel>Dismiss</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { dismiss(); navigate({ to: "/clock" }); }}
            className={isStart ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
          >
            Open clock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
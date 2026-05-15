import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, StopCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTimezone } from "@/hooks/use-timezone";
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

const WARN_BEFORE = 2 * 60 * 1000; // 2 minutes

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
  const { toUtcMs } = useTimezone();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState<{ slot: Slot; stage: Stage } | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set()); // `${slotId}:${stage}`

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
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const [{ data: s }, { data: sh }] = await Promise.all([
        supabase
          .from("shift_slots")
          .select("*")
          .eq("assigned_to", user.id)
          .eq("shift_date", dateStr)
          .eq("slot_type", "shift"),
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
  }, [user, isStaff]);

  // Determine which alert (if any) should currently be visible
  const candidate = useMemo(() => {
    for (const slot of slots) {
      const startsAt = toUtcMs(slot.shift_date, slot.start_time);
      const endsAt = toUtcMs(slot.shift_date, slot.end_time);
      const startKey = `${slot.id}:start`;
      const endKey = `${slot.id}:end`;

      // End warning takes priority
      const toEnd = endsAt - now;
      if (
        openShift &&
        toEnd <= WARN_BEFORE && toEnd > -30 * 1000 &&
        !dismissedRef.current.has(endKey)
      ) {
        return { slot, stage: "end" as Stage };
      }

      const toStart = startsAt - now;
      if (
        !openShift &&
        toStart <= WARN_BEFORE && toStart > -30 * 1000 &&
        !dismissedRef.current.has(startKey)
      ) {
        return { slot, stage: "start" as Stage };
      }
    }
    return null;
  }, [slots, openShift, now, toUtcMs]);

  useEffect(() => {
    if (candidate && (!active || active.slot.id !== candidate.slot.id || active.stage !== candidate.stage)) {
      setActive(candidate);
    } else if (!candidate && active) {
      setActive(null);
    }
  }, [candidate, active]);

  if (!active) return null;

  const startsAt = toUtcMs(active.slot.shift_date, active.slot.start_time);
  const endsAt = toUtcMs(active.slot.shift_date, active.slot.end_time);
  const isStart = active.stage === "start";
  const target = isStart ? startsAt : endsAt;
  const remaining = target - now;
  const overdue = remaining <= 0;

  const dismiss = () => {
    dismissedRef.current.add(`${active.slot.id}:${active.stage}`);
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
              : overdue ? "Shift is ending" : "Shift ending soon"}
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
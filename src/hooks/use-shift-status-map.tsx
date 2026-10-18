import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsDemoAccount } from "@/hooks/use-demo-account";
import { demoShiftStatus } from "@/lib/demo-data";
import { type BreakKind } from "@/lib/breaks";
import { isPreparingForShift } from "@/lib/shift-start";

export type LiveShift = { id: string; user_id: string; clock_in: string };
export type LiveBreak = {
  id: string;
  shift_id: string;
  user_id: string;
  kind: BreakKind;
  started_at: string;
};
export type ShiftStatus = { shift?: LiveShift; break?: LiveBreak; preShift?: boolean };

// Rota dates/times are UK office wall-clock, so always compare against London.
function londonNow(at: number = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}:${get("second")}`,
  };
}

/**
 * Who in `userIds` is signed in to a shift, and which of them is on a break
 * right now. Reads the open `shifts` and `breaks` rows, keeps them fresh in
 * realtime (with a slow poll as a safety net), and re-plans automatically when
 * the rota changes. On the demo account the sample staff stand in for live
 * records, so no real break data is ever shown there.
 */
export function useShiftStatusMap(userIds: string[]): Record<string, ShiftStatus> {
  const isDemo = useIsDemoAccount();
  const key = useMemo(() => Array.from(new Set(userIds)).sort().join(","), [userIds]);
  const [rows, setRows] = useState<{
    shifts: LiveShift[];
    breaks: LiveBreak[];
    slotStarts: Record<string, { shift_date: string; start_time: string; end_time: string }>;
  }>({ shifts: [], breaks: [], slotStarts: {} });
  // Ticks so preparing flips to working at the exact rota start.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (isDemo) {
      setRows({ ...demoShiftStatus(ids), slotStarts: {} });
      return;
    }
    if (ids.length === 0) {
      setRows({ shifts: [], breaks: [], slotStarts: {} });
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const today = londonNow().date;
      const [{ data: s }, { data: b }, { data: slots }] = await Promise.all([
        supabase
          .from("shifts")
          .select("id,user_id,clock_in")
          .is("clock_out", null)
          .in("user_id", ids),
        supabase
          .from("breaks")
          .select("id,shift_id,user_id,kind,started_at")
          .is("ended_at", null)
          .in("user_id", ids),
        supabase
          .from("shift_slots")
          .select("assigned_to,shift_date,start_time,end_time")
          .eq("shift_date", today)
          .in("assigned_to", ids),
      ]);
      if (cancelled) return;
      const slotStarts: typeof rows.slotStarts = {};
      for (const sl of (slots ?? [])) {
        if (!sl.assigned_to) continue;
        const signedIn = s?.find((shift) => shift.user_id === sl.assigned_to);
        if (!signedIn || sl.end_time <= londonNow(Date.parse(signedIn.clock_in)).time) continue;
        // Select the slot associated with this sign-in, not a previous slot.
        if (!slotStarts[sl.assigned_to] || sl.start_time < slotStarts[sl.assigned_to].start_time) {
          slotStarts[sl.assigned_to] = sl;
        }
      }
      setRows({
        shifts: (s as LiveShift[] | null) ?? [],
        breaks: (b as LiveBreak[] | null) ?? [],
        slotStarts,
      });
    };
    void refresh();

    const idSet = new Set(ids);
    const touches = (payload: { new?: unknown; old?: unknown }) => {
      for (const row of [payload.new, payload.old] as Array<{ user_id?: string } | null>) {
        if (row?.user_id && idSet.has(row.user_id)) return true;
      }
      return false;
    };
    const channel = supabase
      .channel(`shift-status:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (p) => {
        if (touches(p)) void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, (p) => {
        if (touches(p)) void refresh();
      })
      .subscribe();
    // Realtime can drop events (socket blips, backgrounded tabs), so re-check.
    const poll = setInterval(() => {
      void refresh();
    }, 20_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [key, isDemo]);

  return useMemo(() => {
    const out: Record<string, ShiftStatus> = {};
    for (const s of rows.shifts) {
      const slotStart = rows.slotStarts[s.user_id];
      // Clocked in before today's rota start = getting ready, not working yet.
      const preShift = isPreparingForShift(now, s.clock_in, slotStart ?? null);
      out[s.user_id] = { ...out[s.user_id], shift: s, preShift };
    }
    for (const b of rows.breaks) out[b.user_id] = { ...out[b.user_id], break: b };
    return out;
  }, [rows, now]);
}

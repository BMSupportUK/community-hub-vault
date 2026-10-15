import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsDemoAccount } from "@/hooks/use-demo-account";
import { demoShiftStatus } from "@/lib/demo-data";
import { type BreakKind } from "@/lib/breaks";

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
  const [rows, setRows] = useState<{ shifts: LiveShift[]; breaks: LiveBreak[] }>({
    shifts: [],
    breaks: [],
  });

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (isDemo) {
      setRows(demoShiftStatus(ids));
      return;
    }
    if (ids.length === 0) {
      setRows({ shifts: [], breaks: [] });
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
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
      ]);
      if (cancelled) return;
      setRows({
        shifts: (s as LiveShift[] | null) ?? [],
        breaks: (b as LiveBreak[] | null) ?? [],
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

    return () => {
      cancelled = true;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [key, isDemo]);

  return useMemo(() => {
    const out: Record<string, ShiftStatus> = {};
    for (const s of rows.shifts) out[s.user_id] = { ...out[s.user_id], shift: s };
    for (const b of rows.breaks) out[b.user_id] = { ...out[b.user_id], break: b };
    return out;
  }, [rows]);
}

import { useEffect, useMemo, useState } from "react";
import { Coffee, UtensilsCrossed, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type StaffShift = { id: string; user_id: string; clock_in: string };
type StaffBreak = { id: string; shift_id: string; user_id: string; kind: "break" | "lunch"; started_at: string };
type StaffProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
const STAFF_BREAK_LIMITS = { break: 15 * 60, lunch: 30 * 60 } as const;

export function StaffOnDutyStrip() {
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [breaks, setBreaks] = useState<StaffBreak[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StaffProfile>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from("shifts").select("id,user_id,clock_in").is("clock_out", null),
      supabase.from("breaks").select("id,shift_id,user_id,kind,started_at").is("ended_at", null),
    ]);
    const ss = (s as StaffShift[]) ?? [];
    setShifts(ss);
    setBreaks((b as StaffBreak[]) ?? []);
    const ids = Array.from(new Set(ss.map((x) => x.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
      setProfiles(Object.fromEntries(((profs as StaffProfile[]) ?? []).map((p) => [p.id, p])));
    } else {
      setProfiles({});
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("shared-staff-onduty-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const breakByUser = useMemo(() => {
    const m = new Map<string, StaffBreak>();
    for (const br of breaks) m.set(br.user_id, br);
    return m;
  }, [breaks]);

  const fmtMinSec = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };
  const fmtHMS = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  };

  return (
    <div className="px-4 pt-4">
      <div className="rounded-xl border border-white/15 p-3 shadow-lg relative overflow-hidden bg-gradient-to-r from-violet-600/40 via-fuchsia-600/40 to-blue-600/40 backdrop-blur">
        <div className="flex items-center justify-between mb-2 relative">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
            Staff on duty · {shifts.length}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 relative">
          {shifts.length === 0 && (
            <div className="shrink-0 min-w-[180px] rounded-lg p-2.5 border border-white/20 bg-white/10 text-white/80 text-xs flex items-center gap-2">
              <CircleDot className="size-3.5 opacity-60" />
              <span>No staff currently on duty</span>
            </div>
          )}
          {shifts.map((s) => {
            const p = profiles[s.user_id];
            const name = p?.display_name || p?.username || "Staff";
            const initials = name.slice(0, 2).toUpperCase();
            const br = breakByUser.get(s.user_id);
            const shiftElapsed = (now - new Date(s.clock_in).getTime()) / 1000;
            const onBreak = !!br;
            const brElapsed = br ? (now - new Date(br.started_at).getTime()) / 1000 : 0;
            const brRemain = br ? STAFF_BREAK_LIMITS[br.kind] - brElapsed : 0;
            const over = brRemain < 0;
            return (
              <div
                key={s.id}
                className={cn(
                  "shrink-0 min-w-[180px] rounded-lg p-2.5 border backdrop-blur transition-colors",
                  onBreak
                    ? (over ? "bg-red-500/30 border-red-300/60" : "bg-amber-300/30 border-amber-200/60")
                    : "bg-emerald-400/25 border-emerald-200/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    {p?.avatar_url ? (
                      <img src={p.avatar_url} alt={name} className="size-8 rounded-full object-cover ring-2 ring-white/40" />
                    ) : (
                      <div className="size-8 rounded-full bg-white/30 grid place-items-center text-[11px] font-bold text-white ring-2 ring-white/40">
                        {initials}
                      </div>
                    )}
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
                      onBreak ? (over ? "bg-red-500" : "bg-amber-400") : "bg-emerald-500",
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{name}</div>
                    <div className="text-[10px] text-white/80">On {fmtHMS(shiftElapsed)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-white">
                  {onBreak ? (
                    <>
                      {br!.kind === "lunch" ? <UtensilsCrossed className="size-3.5" /> : <Coffee className="size-3.5" />}
                      <span className="capitalize">{br!.kind}</span>
                      <span className="ml-auto tabular-nums">
                        {over ? `+${fmtMinSec(-brRemain)}` : fmtMinSec(brRemain)}
                      </span>
                    </>
                  ) : (
                    <>
                      <CircleDot className="size-3.5" />
                      <span>Working</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

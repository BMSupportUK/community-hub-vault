import { useEffect, useState } from "react";
import { Coffee, UtensilsCrossed, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DndCountdown } from "@/components/app/DndCountdown";
import { useDndStatus } from "@/hooks/use-dnd";

type Shift = { id: string; clock_in: string };
type Break = { id: string; kind: "break" | "lunch"; started_at: string };
const LIMITS = { break: 15 * 60, lunch: 30 * 60 } as const;

export function MyWorkingStatus() {
  const { user } = useAuth();
  const dnd = useDndStatus(user?.id);
  const [shift, setShift] = useState<Shift | null>(null);
  const [brk, setBrk] = useState<Break | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data: s } = await supabase
        .from("shifts").select("id,clock_in")
        .eq("user_id", user.id).is("clock_out", null).maybeSingle();
      setShift((s as Shift) ?? null);
      if (s) {
        const { data: b } = await supabase
          .from("breaks").select("id,kind,started_at")
          .eq("shift_id", (s as Shift).id).is("ended_at", null).maybeSingle();
        setBrk((b as Break) ?? null);
      } else {
        setBrk(null);
      }
    };
    refresh();
    const ch = supabase
      .channel(`my-working-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks", filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return null;
  // DND overrides every other status — the pill is rendered next to the
  // "Do Not Disturb" label in WorkingStatusBox, so hide here.
  if (dnd?.active) {
    return null;
  }
  if (!shift) {
    return null;
  }

  const shiftSec = (now - new Date(shift.clock_in).getTime()) / 1000;
  const brSec = brk ? (now - new Date(brk.started_at).getTime()) / 1000 : 0;
  const brRemain = brk ? LIMITS[brk.kind] - brSec : 0;
  const over = brRemain < 0;

  const fmtHM = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtMS = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="inline-flex items-center gap-1.5">
    <div
      className={cn(
        "inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold ring-1 shadow-soft shrink-0",
        brk
          ? over
            ? "bg-destructive/15 text-destructive ring-destructive/40"
            : "bg-amber-500/15 text-amber-400 ring-amber-500/40"
          : "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40",
      )}
      title={brk ? `On ${brk.kind}` : "Working"}
    >
      {brk ? (
        brk.kind === "lunch" ? <UtensilsCrossed className="size-3 sm:size-3.5" /> : <Coffee className="size-3 sm:size-3.5" />
      ) : (
        <CircleDot className="size-3 sm:size-3.5" />
      )}
      {brk && <span className="capitalize hidden sm:inline">{brk.kind}</span>}
      <span className="tabular-nums opacity-90">
        {brk ? (over ? `+${fmtMS(-brRemain)}` : fmtMS(brRemain)) : fmtHM(shiftSec)}
      </span>
    </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { Coffee, UtensilsCrossed, CircleDot, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Shift = { id: string; clock_in: string };
type Break = { id: string; kind: "break" | "lunch"; started_at: string };
const LIMITS = { break: 15 * 60, lunch: 30 * 60 } as const;

export function WorkingStatusBox() {
  const { user } = useAuth();
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
      .channel(`working-box-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks", filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user || !shift) return null;

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
    <section className="px-2 pt-4">
      <div className="rounded-lg bg-surface-2/60 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-emerald-600/10 via-amber-600/10 to-rose-600/10">
          <div className="flex items-center gap-2">
            <Briefcase className="size-3.5 text-emerald-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">Working Status</h2>
          </div>
        </div>
        <div className="px-3 py-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Shift</span>
            <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-emerald-400">
              <CircleDot className="size-3" />
              {fmtHM(shiftSec)}
            </span>
          </div>
          {brk && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground capitalize">{brk.kind}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1",
                  over
                    ? "bg-destructive/15 text-destructive ring-destructive/40"
                    : "bg-amber-500/15 text-amber-400 ring-amber-500/40",
                )}
              >
                {brk.kind === "lunch" ? <UtensilsCrossed className="size-3" /> : <Coffee className="size-3" />}
                {over ? `+${fmtMS(-brRemain)}` : fmtMS(brRemain)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { breakIcon } from "@/lib/breaks";
import { planBreaks, toMinutes, fromMinutes, type UserPlan } from "@/lib/break-plan";

const ukNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};

/** Planned Break 1 / Lunch / Break 2 times for staff and management on today's rota. */
export function BreakPlanRows({ userId, usedKinds }: { userId: string; usedKinds: readonly string[] }) {
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [nowMin, setNowMin] = useState(() => ukNow().minutes);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const today = ukNow().date;
      const [{ data: slots }, { data: roles }] = await Promise.all([
        supabase.from("shift_slots").select("assigned_to,start_time,end_time,slot_type").eq("shift_date", today).not("assigned_to", "is", null),
        supabase.rpc("directory_member_roles"),
      ]);
      const eligible = new Set(((roles ?? []) as { user_id: string; role: string }[]).filter((r) => r.role === "staff" || r.role === "management").map((r) => r.user_id));
      const rows = (slots ?? []).filter((s) => s.slot_type === "shift" && s.assigned_to && eligible.has(s.assigned_to))
        .map((s) => ({ userId: s.assigned_to as string, start: toMinutes(s.start_time), end: toMinutes(s.end_time) }));
      if (alive) setPlan(planBreaks(rows, 1, ukNow().minutes).get(userId) ?? null);
    };
    void load();
    const ch = supabase.channel(`break-plan-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots" }, () => void load()).subscribe();
    const t = setInterval(() => setNowMin(ukNow().minutes), 30_000);
    return () => { alive = false; supabase.removeChannel(ch); clearInterval(t); };
  }, [userId, nowMin]);

  const items = useMemo(() => {
    if (!plan) return [];
    const breaksUsed = usedKinds.filter((k) => k === "break").length;
    const lunchUsed = usedKinds.includes("lunch");
    return [
      { ...plan.break1, done: breaksUsed >= 1 },
      { ...plan.lunch, done: lunchUsed },
      { ...plan.break2, done: breaksUsed >= 2 },
    ];
  }, [plan, usedKinds]);

  // Reminder when an allocated time arrives (staff still tap to start it).
  useEffect(() => {
    for (const it of items) {
      if (it.done || it.start === null || nowMin < it.start || nowMin > it.start + 15) continue;
      const key = `break-plan-${userId}-${ukNow().date}-${it.label}`;
      try { if (sessionStorage.getItem(key)) continue; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      toast.info(`${it.label} is due now (${fromMinutes(it.start)}) — start it from Working Status.`, { duration: 15_000 });
    }
  }, [items, nowMin, userId]);

  if (!plan) return null;
  const next = items.find((i) => !i.done && i.start !== null);
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="text-muted-foreground font-medium">Allocated breaks (UK office)</span>
      {items.map((it) => {
        const Icon = it.done ? CheckCircle2 : breakIcon(it.kind);
        return (
          <div key={it.label} className={cn("flex items-center justify-between rounded-full px-3 py-1 ring-1",
            it.done ? "bg-muted/20 ring-border text-muted-foreground line-through" : it === next ? "bg-warning/15 ring-warning/40 text-warning" : "bg-white/[0.05] ring-white/15")}>
            <span className="inline-flex items-center gap-1.5 font-medium"><Icon className="size-3.5" />{it.label}</span>
            <span className="tabular-nums font-semibold">{it.start === null ? "No slot – ask a manager" : fromMinutes(it.start)}</span>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Coffee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { breakIcon } from "@/lib/breaks";
import { planBreaks, toMinutes, fromMinutes, type UserPlan } from "@/lib/break-plan";
import { countOpenTickets, passTicketsForBreak } from "@/lib/break-handover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ukNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};

function useUkMinuteTicker() {
  const [nowMin, setNowMin] = useState(() => ukNow().minutes);
  useEffect(() => { const t = setInterval(() => setNowMin(ukNow().minutes), 30_000); return () => clearInterval(t); }, []);
  return nowMin;
}

/** Shared loader: planned Break 1 / Main break / Break 2 times for a staff member's rota slot today. */
export function useBreakPlan(userId: string) {
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const nowMin = useUkMinuteTicker();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const today = ukNow().date;
      const [{ data: slots }, { data: roles }] = await Promise.all([
        supabase.from("shift_slots").select("assigned_to,required_role,start_time,end_time,slot_type").eq("shift_date", today),
        supabase.rpc("directory_member_roles"),
      ]);
      const eligible = new Set(((roles ?? []) as { user_id: string; role: string }[]).filter((r) => r.role === "staff" || r.role === "management" || r.role === "admin" || r.role === "moderator").map((r) => r.user_id));
      const rows = (slots ?? []).filter((s) => s.slot_type === "shift" && s.assigned_to && eligible.has(s.assigned_to))
        .map((s) => ({ userId: s.assigned_to as string, start: toMinutes(s.start_time), end: toMinutes(s.end_time) }));
      // Open rota slots (no one named) apply to everyone holding that role.
      if (!rows.some((r) => r.userId === userId)) {
        const mine = new Set(((roles ?? []) as { user_id: string; role: string }[]).filter((r) => r.user_id === userId).map((r) => r.role));
        const open = (slots ?? []).find((s) => s.slot_type === "shift" && !s.assigned_to && s.required_role && mine.has(s.required_role));
        if (open && eligible.has(userId)) rows.push({ userId, start: toMinutes(open.start_time), end: toMinutes(open.end_time) });
      }
      const { data: stored } = await supabase.from("break_plan_times").select("label,kind,start_min").eq("user_id", userId).eq("shift_date", today);
      if (stored && stored.length >= 3) {
        const by = (l: string) => { const r = stored.find((x) => x.label === l || (l === "Main break" && x.label === "Lunch")); return { kind: (r?.kind === "lunch" ? "lunch" : "break") as "break" | "lunch", label: l, start: r?.start_min ?? null }; };
        if (alive) setPlan({ break1: by("Break 1"), lunch: by("Main break"), break2: by("Break 2") });
        return;
      }
      if (alive) setPlan(planBreaks(rows, 1, ukNow().minutes).get(userId) ?? null);
    };
    void load();
    const ch = supabase.channel(`break-plan-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots" }, () => void load()).subscribe();
    const r = setInterval(() => void load(), 60_000);
    return () => { alive = false; supabase.removeChannel(ch); clearInterval(r); };
  }, [userId]);
  return { plan, nowMin };
}

/** usedKinds entries may be "break" or "break@<UK minutes>" (when the break was started). */
export function planItems(plan: UserPlan | null, usedKinds: readonly string[], nowMin: number) {
  if (!plan) return [];
  const breakEntries = usedKinds.filter((k) => k === "break" || k.startsWith("break@"));
  const lunchUsed = usedKinds.some((k) => k === "lunch" || k.startsWith("lunch@"));
  let b1 = false;
  let b2 = false;
  for (const e of breakEntries) {
    const at = e.includes("@") ? Number(e.split("@")[1]) : NaN;
    const s1 = plan.break1.start;
    const s2 = plan.break2.start;
    // A break taken nearer Break 2's slot counts as Break 2, not Break 1.
    const prefer2 = !Number.isNaN(at) && s2 !== null && (s1 === null || Math.abs(at - s2) < Math.abs(at - s1));
    if (prefer2 && !b2) b2 = true;
    else if (!b1) b1 = true;
    else b2 = true;
  }
  return [
    { ...plan.break1, done: b1 },
    { ...plan.lunch, done: lunchUsed },
    { ...plan.break2, done: b2 },
  ].map((it) => ({ ...it, missed: !it.done && it.start !== null && nowMin > it.start + 15 }));
}

/** Compact "next upcoming break" pill for the Talk channel staff controls header. */
export function NextBreakPill({ userId, usedKinds }: { userId: string; usedKinds: readonly string[] }) {
  const { plan, nowMin } = useBreakPlan(userId);
  const next = planItems(plan, usedKinds, nowMin).find((i) => !i.done && !i.missed && i.start !== null);
  if (!next || next.start === null) return null;
  return (
    <span
      title={`Next break: ${next.label} at ${fromMinutes(next.start)} UK office time`}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-warning/40"
    >
      <Coffee className="size-3" />
      {next.label} · {fromMinutes(next.start)}
    </span>
  );
}

/** Planned Break 1 / Main break / Break 2 times for staff and management on today's rota. */
// These staff have their breaks started for them at the allocated time.
const AUTO_START_USERNAMES = new Set(["danej", "normanbyred77"]);
const autoStartedKeys = new Set<string>();

export function BreakPlanRows({ userId, usedKinds, onStartBreak, listHidden }: { userId: string; usedKinds: readonly string[]; onStartBreak?: (kind: "break" | "lunch") => void; listHidden?: boolean }) {
  const { plan, nowMin } = useBreakPlan(userId);
  const [autoStart, setAutoStart] = useState(false);
  const [autoNotice, setAutoNotice] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.from("profiles").select("username").eq("id", userId).maybeSingle().then(({ data }) => {
      if (alive) setAutoStart(AUTO_START_USERNAMES.has(String((data as { username?: string } | null)?.username ?? "").toLowerCase()));
    });
    return () => { alive = false; };
  }, [userId]);

  const items = useMemo(() => planItems(plan, usedKinds, nowMin), [plan, usedKinds, nowMin]);

  // When an allocated time arrives, show a popup. If the staff member is on a
  // ticket they must press "Pass ticket over" first, then "Start break".
  // No snooze / remind-me option and it can't be dismissed.
  const dueItem = items.find((it) => !it.done && !it.missed && it.start !== null && nowMin >= it.start);
  const dueKey = dueItem && dueItem.start !== null ? `${dueItem.label}@${dueItem.start}` : null;
  // No manual starts — breaks begin only from this allocated-time pop-up.
  const activeItem = dueItem;
  const activeKey = dueKey;
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    setPassed(false);
    setTicketCount(null);
    if (!activeKey) return;
    let alive = true;
    void countOpenTickets(userId).then((n) => { if (alive) setTicketCount(n); });
    return () => { alive = false; };
  }, [activeKey, userId]);

  // Auto-start: pass any tickets over, start the break, then show a notice.
  useEffect(() => {
    if (!autoStart || !activeKey || !activeItem || !onStartBreak) return;
    const key = `${userId}:${ukNow().date}:${activeKey}`;
    if (autoStartedKeys.has(key)) return;
    autoStartedKeys.add(key);
    const item = activeItem;
    void (async () => {
      const n = await countOpenTickets(userId);
      if (n > 0) await passTicketsForBreak(item.kind);
      onStartBreak(item.kind);
      setAutoNotice(`Your ${item.label.toLowerCase()} has started automatically.${n > 0 ? ` Your ticket${n === 1 ? " was" : "s were"} passed over.` : ""} It ends on its own.`);
    })();
  }, [autoStart, activeKey, activeItem, onStartBreak, userId]);

  const onTicket = (ticketCount ?? 0) > 0 && !passed;
  const passOver = async () => {
    if (!activeItem) return;
    setWorking(true);
    const ok = await passTicketsForBreak(activeItem.kind);
    setWorking(false);
    if (ok) setPassed(true);
  };
  const startActive = () => {
    if (!activeItem) return;
    onStartBreak?.(activeItem.kind);
  };

  if (!plan) return null;
  const autoDialog = (
    <Dialog open={!!autoNotice} onOpenChange={(o) => { if (!o) setAutoNotice(null); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coffee className="size-5 text-warning" />Break started</DialogTitle>
          <DialogDescription>{autoNotice}</DialogDescription>
        </DialogHeader>
        <Button className="w-full" onClick={() => setAutoNotice(null)}>OK</Button>
      </DialogContent>
    </Dialog>
  );
  if (listHidden) return autoStart ? autoDialog : null;
  const next = items.find((i) => !i.done && !i.missed && i.start !== null);
  return (
    <>
      {autoDialog}
      <div className="grid gap-1.5 text-xs">
        <span className="text-muted-foreground font-medium">Allocated breaks (UK office)</span>
        {items.map((it) => {
          const Icon = it.done ? CheckCircle2 : breakIcon(it.kind);
          return (
            <div key={it.label} className={cn("flex items-center justify-between rounded-full px-3 py-1 ring-1",
              it.done ? "bg-muted/20 ring-border text-muted-foreground line-through" : it.missed ? "bg-muted/10 ring-border text-muted-foreground/60" : it === next ? "bg-warning/15 ring-warning/40 text-warning" : "bg-white/[0.05] ring-white/15")}>
              <span className="inline-flex items-center gap-1.5 font-medium"><Icon className="size-3.5" />{it.label}</span>
              <span className="tabular-nums font-semibold">{it.start === null ? "No slot – ask a manager" : it.missed ? "Missed" : fromMinutes(it.start)}</span>
            </div>
          );
        })}
      </div>
      <Dialog open={!autoStart && !!activeKey && !!onStartBreak && ticketCount !== null} onOpenChange={() => {}}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-md overflow-x-hidden [&>button]:hidden"
          onEscapeKeyDown={(e) => { if (dueKey) e.preventDefault(); }}
          onInteractOutside={(e) => { if (dueKey) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Coffee className="size-5 text-warning" />{activeItem?.label} time</DialogTitle>
            <DialogDescription>
              {onTicket
                ? `You're dealing with ${ticketCount} ticket${ticketCount === 1 ? "" : "s"}. Pass ${ticketCount === 1 ? "it" : "them"} over, then start your ${activeItem?.label.toLowerCase()}.`
                : `Start your ${activeItem?.label.toLowerCase()}. It ends on its own.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {onTicket && (
              <Button variant="outline" className="w-full" disabled={working} onClick={() => void passOver()}>
                Pass ticket{ticketCount === 1 ? "" : "s"} over
              </Button>
            )}
            <Button className="w-full" disabled={onTicket || working} onClick={startActive}>
              Start {activeItem?.label.toLowerCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

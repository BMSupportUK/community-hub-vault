import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut, Coffee, UtensilsCrossed, Loader2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import clockBg from "@/assets/clock-bg.jpg";
import { useServerFn } from "@tanstack/react-start";
import { sendShiftEventPush, sendBreakEventPush } from "@/lib/push.functions";
import { PushNotificationsToggle } from "@/components/app/PushNotificationsToggle";
import { type BreakKind, BREAK_LIMITS, breakLabel, breaksLeft } from "@/lib/breaks";
import { StaffOnDutyStrip } from "@/components/app/StaffOnDutyStrip";
import { Button } from "@/components/ui/button";
import { requestEarlyFinish } from "@/lib/early-finish.functions";
import { shiftFinishAction, ukClock } from "@/lib/shift-finish";

export const Route = createFileRoute("/_authenticated/_approved/clock")({
  head: () => ({ meta: [
    { title: "Time Tracking — BM Support" },
    { name: "description", content: "BM Support staff shift hours, breaks and early-finish requests." },
    { property: "og:title", content: "Time Tracking — BM Support" },
    { property: "og:description", content: "Manage BM Support staff shifts and break times." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClockPage,
});

interface Shift { id: string; user_id: string; clock_in: string; clock_out: string | null; }
interface Break { id: string; shift_id: string; user_id: string; kind: BreakKind; started_at: string; ended_at: string | null; }

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${ss}`;
}
function fmtMin(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function ClockPage() {
  const { user, isStaff } = useAuth();
  const notifyShift = useServerFn(sendShiftEventPush);
  const notifyBreak = useServerFn(sendBreakEventPush);
  const askEarlyFinish = useServerFn(requestEarlyFinish);
  const [rotaEnd, setRotaEnd] = useState<string | null>(null);
  const [finishReady, setFinishReady] = useState(false);
  const [earlyPending, setEarlyPending] = useState(false);
  const tz = useUserTimezone();
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const fmtDateTime = (ms: number) =>
    new Date(ms).toLocaleString("en-GB", { timeZone: tz });
  const fmtClock = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myBreak, setMyBreak] = useState<Break | null>(null);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<Break[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [usedKinds, setUsedKinds] = useState<string[]>([]);
  const breakLeft = breaksLeft("break", usedKinds);
  const lunchLeft = breaksLeft("lunch", usedKinds);

  const refresh = async () => {
    if (!user) return;
    const [{ data: mine }, { data: allShifts }, { data: allBreaks }] = await Promise.all([
      supabase.from("shifts").select("*").eq("user_id", user.id).is("clock_out", null).order("clock_in", { ascending: true }).limit(1).maybeSingle(),
      isStaff ? supabase.from("shifts").select("*").is("clock_out", null) : Promise.resolve({ data: [] as Shift[] }),
      isStaff ? supabase.from("breaks").select("*").is("ended_at", null) : Promise.resolve({ data: [] as Break[] }),
    ]);
    setMyShift((mine as Shift) ?? null);
    setActiveShifts((allShifts as Shift[]) ?? []);
    setActiveBreaks((allBreaks as Break[]) ?? []);

    const london = ukClock(Date.now());
    const [{ data: slots, error: rotaError }, { data: requests, error: requestError }] = await Promise.all([
      supabase.from("shift_slots").select("start_time,end_time").eq("assigned_to", user.id)
        .eq("shift_date", london.date).order("start_time"),
      mine ? supabase.from("early_finish_requests").select("id").eq("shift_id", mine.id)
        .eq("status", "pending").limit(1) : Promise.resolve({ data: [], error: null }),
    ]);
    setRotaEnd(slots?.find((slot) => slot.end_time > london.time)?.end_time ?? null);
    setEarlyPending((requests ?? []).length > 0);
    setFinishReady(!rotaError && !requestError);

    if (mine) {
      const { data: br } = await supabase
        .from("breaks").select("*").eq("shift_id", (mine as Shift).id).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
      setMyBreak((br as Break) ?? null);
      const { data: all } = await supabase.from("breaks").select("kind").eq("shift_id", (mine as Shift).id);
      setUsedKinds(((all as { kind: string }[]) ?? []).map((r) => r.kind));
    } else {
      setMyBreak(null);
      setUsedKinds([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`clock-${user?.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "early_finish_requests" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isStaff]);

  const clockIn = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("shifts").insert({ user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    notifyShift({ data: { kind: "clock_in" } }).catch(() => {});
    refresh();
  };

  const clockOut = async () => {
    if (!myShift || busy) return;
    const action = shiftFinishAction(Date.now(), rotaEnd, earlyPending, finishReady);
    if (action === "wait") return;
    if (action === "request") {
      const reason = window.prompt("Request an early finish — admin or management must approve it.\n\nReason (optional):");
      if (reason === null) return;
      setBusy(true);
      try {
        await askEarlyFinish({ data: { reason } });
        setEarlyPending(true);
        toast.success("Early finish requested — you'll be signed off once it's approved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't send the request");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    if (myBreak) {
      await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", myBreak.id);
      notifyBreak({ data: { kind: "end", breakKind: myBreak.kind } }).catch(() => {});
    }
    const { error } = await supabase.from("shifts").update({ clock_out: new Date().toISOString() }).eq("id", myShift.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    notifyShift({ data: { kind: "clock_out" } }).catch(() => {});
    refresh();
  };

  const startBreak = async (kind: BreakKind) => {
    if (!user || !myShift || myBreak || busy) return;
    if (kind !== "travel" && breaksLeft(kind, usedKinds) <= 0) return;
    setBusy(true);
    const { error } = await supabase.from("breaks").insert({ shift_id: myShift.id, user_id: user.id, kind });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "lunch" ? "Lunch started — 30 min" : "Break started — 15 min");
    notifyBreak({ data: { kind: "start", breakKind: kind } }).catch(() => {});
    refresh();
  };


  const sessionSeconds = myShift ? (now - new Date(myShift.clock_in).getTime()) / 1000 : 0;
  const breakElapsed = myBreak ? (now - new Date(myBreak.started_at).getTime()) / 1000 : 0;
  const breakRemaining = myBreak ? BREAK_LIMITS[myBreak.kind] - breakElapsed : 0;
  const overBreak = breakRemaining < 0;
  const finishAction = shiftFinishAction(now, rotaEnd, earlyPending, finishReady);




  if (loading) {
    return (
      <main className="flex-1 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></main>
    );
  }

  return (
    <main
      className="flex-1 overflow-y-auto relative bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${clockBg})` }}
    >
      <div className="absolute inset-0 bg-background/45 backdrop-blur-[2px] pointer-events-none" aria-hidden />
      <div className="relative w-full px-4 sm:px-6 py-8 space-y-6">
        <header className="flex items-center gap-3 flex-wrap">
          <div className="size-12 rounded-2xl bg-primary/20 backdrop-blur grid place-items-center ring-1 ring-primary/30">
            <Clock className="size-6 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold drop-shadow">Time Tracking</h1>
            <p className="text-sm text-muted-foreground">{fmtDateTime(now)} <span className="opacity-70">({tz})</span></p>
          </div>
          <div className="font-mono text-3xl tabular-nums drop-shadow">{fmtClock(now)}</div>
        </header>

        {/* Push notifications toggle */}
        <div className="rounded-2xl border border-border bg-surface-1/70 backdrop-blur-md p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/15 grid place-items-center">
              <Bell className="size-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">Shift & break alerts</div>
              <div className="text-xs text-muted-foreground">Get notified when your shift or break is about to end, even with the app closed.</div>
            </div>
          </div>
          <PushNotificationsToggle />
        </div>

        {/* Status banner */}
        <div className={cn(
          "rounded-2xl p-5 border backdrop-blur-md",
          !myShift && "bg-surface-1/70 border-border",
          myShift && !myBreak && "bg-emerald-500/15 border-emerald-500/40",
          myBreak && !overBreak && "bg-amber-500/15 border-amber-500/40",
          myBreak && overBreak && "bg-destructive/15 border-destructive/50",
        )}>
          {!myShift && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Not clocked in</div>
                <div className="text-sm text-muted-foreground">Start your shift to track hours.</div>
              </div>
              <button onClick={clockIn} disabled={busy} className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium inline-flex items-center gap-2 disabled:opacity-60">
                <LogIn className="size-4" /> Clock In
              </button>
            </div>
          )}
          {myShift && !myBreak && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold text-emerald-400">Working — {fmt(sessionSeconds)}</div>
                <div className="text-sm text-muted-foreground">Started {fmtTime(myShift.clock_in)}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startBreak("break")} disabled={busy || breakLeft <= 0} title={breakLeft > 0 ? `${breakLeft} of 2 breaks left` : "No breaks left this shift"} className="px-4 py-2 rounded-lg bg-surface-2 border border-border hover:border-primary inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border">
                  <Coffee className="size-4" /> Start break (15m)
                </button>
                <button onClick={() => startBreak("lunch")} disabled={busy || lunchLeft <= 0} title={lunchLeft > 0 ? "Start lunch" : "Lunch already taken this shift"} className="px-4 py-2 rounded-lg bg-surface-2 border border-border hover:border-primary inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border">
                  <UtensilsCrossed className="size-4" /> Start lunch (30m)
                </button>
                <Button onClick={clockOut} disabled={busy || finishAction === "wait"}
                  variant={finishAction === "clock-out" ? "destructive" : "outline"}
                  title={finishAction === "clock-out" ? "Sign out of shift" : earlyPending
                    ? "Early finish requested — waiting for admin or management"
                    : `Shift sign-out unlocks at ${rotaEnd?.slice(0, 5) ?? "shift end"} UK — request an early finish`}
                  className={cn(finishAction !== "clock-out" && "text-muted-foreground bg-muted/30 opacity-50")}>
                  <LogOut className="size-4" /> {finishAction === "clock-out" ? "Clock Out" : earlyPending ? "Awaiting approval" : "Request early finish"}
                </Button>
              </div>
            </div>
          )}
          {myBreak && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className={cn("font-semibold", overBreak ? "text-destructive" : "text-amber-400")}>
                  On {breakLabel(myBreak.kind).toLowerCase()} — {overBreak ? `over by ${fmtMin(-breakRemaining)}` : `${fmtMin(breakRemaining)} left`}
                </div>
                <div className="text-sm text-muted-foreground">Elapsed {fmtMin(breakElapsed)} of {BREAK_LIMITS[myBreak.kind] / 60}m — ends automatically when the time is up</div>
              </div>
            </div>
          )}

        </div>

        {/* Staff status panel — staff strip cards, side by side */}
        {isStaff && (
          <section className="rounded-2xl border border-border bg-surface-1/70 backdrop-blur-md overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface-2/70 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold">On shift right now</div>
              <div className="text-xs text-muted-foreground">{activeShifts.length} working · {activeBreaks.length} on break</div>
            </div>
            <div className="p-4">
              <StaffOnDutyStrip variant="tickets" />
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

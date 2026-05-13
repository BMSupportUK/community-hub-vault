import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, LogIn, LogOut, Coffee, UtensilsCrossed, Loader2, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/clock")({
  component: ClockPage,
});

type BreakKind = "break" | "lunch";
const BREAK_LIMITS: Record<BreakKind, number> = { break: 15 * 60, lunch: 30 * 60 };

interface Shift { id: string; user_id: string; clock_in: string; clock_out: string | null; }
interface Break { id: string; shift_id: string; user_id: string; kind: BreakKind; started_at: string; ended_at: string | null; }
interface Profile { id: string; username: string | null; display_name: string | null; }

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
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myBreak, setMyBreak] = useState<Break | null>(null);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<Break[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    if (!user) return;
    const [{ data: mine }, { data: allShifts }, { data: allBreaks }] = await Promise.all([
      supabase.from("shifts").select("*").eq("user_id", user.id).is("clock_out", null).maybeSingle(),
      isStaff ? supabase.from("shifts").select("*").is("clock_out", null) : Promise.resolve({ data: [] as Shift[] }),
      isStaff ? supabase.from("breaks").select("*").is("ended_at", null) : Promise.resolve({ data: [] as Break[] }),
    ]);
    setMyShift((mine as Shift) ?? null);
    setActiveShifts((allShifts as Shift[]) ?? []);
    setActiveBreaks((allBreaks as Break[]) ?? []);

    if (mine) {
      const { data: br } = await supabase
        .from("breaks").select("*").eq("shift_id", (mine as Shift).id).is("ended_at", null).maybeSingle();
      setMyBreak((br as Break) ?? null);
    } else {
      setMyBreak(null);
    }

    const ids = Array.from(new Set([...(allShifts ?? []).map((s: Shift) => s.user_id)]));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name").in("id", ids);
      setProfiles(Object.fromEntries((profs ?? []).map((p) => [p.id, p as Profile])));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("clock")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => refresh())
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
    refresh();
  };

  const clockOut = async () => {
    if (!myShift) return;
    setBusy(true);
    if (myBreak) {
      await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", myBreak.id);
    }
    const { error } = await supabase.from("shifts").update({ clock_out: new Date().toISOString() }).eq("id", myShift.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    refresh();
  };

  const startBreak = async (kind: BreakKind) => {
    if (!myShift || myBreak) return;
    setBusy(true);
    const { error } = await supabase.from("breaks").insert({ shift_id: myShift.id, user_id: user!.id, kind });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "lunch" ? "Lunch started — 30 min" : "Break started — 15 min");
    refresh();
  };

  const endBreak = async () => {
    if (!myBreak) return;
    setBusy(true);
    const { error } = await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", myBreak.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Break ended");
    refresh();
  };

  const sessionSeconds = myShift ? (now - new Date(myShift.clock_in).getTime()) / 1000 : 0;
  const breakElapsed = myBreak ? (now - new Date(myBreak.started_at).getTime()) / 1000 : 0;
  const breakRemaining = myBreak ? BREAK_LIMITS[myBreak.kind] - breakElapsed : 0;
  const overBreak = breakRemaining < 0;

  const breaksByUser = useMemo(() => {
    const m = new Map<string, Break>();
    activeBreaks.forEach((b) => m.set(b.user_id, b));
    return m;
  }, [activeBreaks]);

  if (loading) {
    return (
      <main className="flex-1 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center gap-3">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <Clock className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Time Tracking</h1>
            <p className="text-sm text-muted-foreground">{new Date(now).toLocaleString()}</p>
          </div>
          <div className="font-mono text-3xl tabular-nums">{new Date(now).toLocaleTimeString()}</div>
        </header>

        {/* Status banner */}
        <div className={cn(
          "rounded-2xl p-5 border",
          !myShift && "bg-surface-1 border-border",
          myShift && !myBreak && "bg-emerald-500/10 border-emerald-500/30",
          myBreak && !overBreak && "bg-amber-500/10 border-amber-500/30",
          myBreak && overBreak && "bg-destructive/10 border-destructive/40",
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
                <div className="text-sm text-muted-foreground">Started {new Date(myShift.clock_in).toLocaleTimeString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startBreak("break")} disabled={busy} className="px-4 py-2 rounded-lg bg-surface-2 border border-border hover:border-primary inline-flex items-center gap-2 text-sm">
                  <Coffee className="size-4" /> Start break (15m)
                </button>
                <button onClick={() => startBreak("lunch")} disabled={busy} className="px-4 py-2 rounded-lg bg-surface-2 border border-border hover:border-primary inline-flex items-center gap-2 text-sm">
                  <UtensilsCrossed className="size-4" /> Start lunch (30m)
                </button>
                <button onClick={clockOut} disabled={busy} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground inline-flex items-center gap-2 text-sm">
                  <LogOut className="size-4" /> Clock Out
                </button>
              </div>
            </div>
          )}
          {myBreak && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className={cn("font-semibold", overBreak ? "text-destructive" : "text-amber-400")}>
                  On {myBreak.kind} — {overBreak ? `over by ${fmtMin(-breakRemaining)}` : `${fmtMin(breakRemaining)} left`}
                </div>
                <div className="text-sm text-muted-foreground">Elapsed {fmtMin(breakElapsed)} of {BREAK_LIMITS[myBreak.kind] / 60}m</div>
              </div>
              <button onClick={endBreak} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-2 text-sm">
                <PlayCircle className="size-4" /> End break
              </button>
            </div>
          )}
        </div>

        {/* Staff status panel */}
        {isStaff && (
          <section className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
              <div className="text-sm font-semibold">On shift right now</div>
              <div className="text-xs text-muted-foreground">{activeShifts.length} working · {activeBreaks.length} on break</div>
            </div>
            {activeShifts.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nobody's clocked in.</div>
            ) : (
              <ul className="divide-y divide-border">
                {activeShifts.map((s) => {
                  const p = profiles[s.user_id];
                  const br = breaksByUser.get(s.user_id);
                  const elapsed = (now - new Date(s.clock_in).getTime()) / 1000;
                  const brElapsed = br ? (now - new Date(br.started_at).getTime()) / 1000 : 0;
                  const brRemain = br ? BREAK_LIMITS[br.kind] - brElapsed : 0;
                  const over = brRemain < 0;
                  return (
                    <li key={s.id} className="px-5 py-3 flex items-center gap-4">
                      <div className="size-10 rounded-full bg-surface-2 grid place-items-center font-semibold uppercase">
                        {(p?.display_name ?? p?.username ?? "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p?.display_name || p?.username || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">@{p?.username ?? s.user_id.slice(0, 8)}</div>
                        {br ? (
                          <div className={cn("text-xs mt-0.5 font-medium", over ? "text-destructive" : "text-amber-400")}>
                            {br.kind === "lunch" ? "🍽 Lunch" : "☕ Break"} · {over ? `over by ${fmtMin(-brRemain)}` : `${fmtMin(brRemain)} left`}
                          </div>
                        ) : (
                          <div className="text-xs mt-0.5 text-emerald-400 font-medium">● Working</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-sm">{fmt(elapsed)}</div>
                        <div className="text-[10px] text-muted-foreground">since {new Date(s.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

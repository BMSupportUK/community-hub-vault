import { useEffect, useState } from "react";
import {
  CircleDot,
  Briefcase,
  LogIn,
  LogOut,
  Coffee,
  UtensilsCrossed,
  PlayCircle,
  Loader2,
  Calendar,
  Clock,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useDndStatus } from "@/hooks/use-dnd";
import { Moon } from "lucide-react";
import { DndCountdown } from "@/components/app/DndCountdown";
import { DndDialogButton } from "@/components/app/DndDialogButton";
import { type BreakKind, BREAK_LIMITS as LIMITS, breakLabel, breakIcon } from "@/lib/breaks";
import { useServerFn } from "@tanstack/react-start";
import { sendShiftEventPush, sendBreakEventPush } from "@/lib/push.functions";
import { toast } from "sonner";
import { formatRoleLabel } from "@/lib/role-label";

type Shift = { id: string; clock_in: string };
type Break = { id: string; kind: BreakKind; started_at: string };
type NextSlot = { id: string; shift_date: string; start_time: string; end_time: string };

export function WorkingStatusBox({ stackActions = false }: { stackActions?: boolean } = {}) {
  const { user, roles } = useAuth();
  const dnd = useDndStatus(user?.id);
  const notifyShift = useServerFn(sendShiftEventPush);
  const notifyBreak = useServerFn(sendBreakEventPush);
  const [shift, setShift] = useState<Shift | null>(null);
  const [brk, setBrk] = useState<Break | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [nextSlot, setNextSlot] = useState<NextSlot | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data: s } = await supabase
        .from("shifts")
        .select("id,clock_in")
        .eq("user_id", user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: true })
        .limit(1)
        .maybeSingle();
      setShift((s as Shift) ?? null);
      if (s) {
        const { data: b } = await supabase
          .from("breaks")
          .select("id,kind,started_at")
          .eq("shift_id", (s as Shift).id)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setBrk((b as Break) ?? null);
      } else {
        setBrk(null);
      }
      // Next claimed rota slot (today, still to come — or any future day).
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const nowTime = `${pad(today.getHours())}:${pad(today.getMinutes())}:00`;
      const { data: slots } = await supabase
        .from("shift_slots")
        .select("id,shift_date,start_time,end_time")
        .eq("assigned_to", user.id)
        .gte("shift_date", todayStr)
        .order("shift_date")
        .order("start_time")
        .limit(10);
      const upcoming = ((slots ?? []) as NextSlot[]).find(
        (sl) => sl.shift_date > todayStr || sl.end_time > nowTime,
      );
      setNextSlot(upcoming ?? null);
    };
    refresh();
    const ch = supabase
      .channel(`working-box-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breaks", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const clockIn = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("shifts").insert({ user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    notifyShift({ data: { kind: "clock_in" } }).catch(() => {});
  };

  const clockOut = async () => {
    if (!shift) return;
    setBusy(true);
    if (brk) {
      await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", brk.id);
      notifyBreak({ data: { kind: "end", breakKind: brk.kind } }).catch(() => {});
    }
    const { error } = await supabase
      .from("shifts")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", shift.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    notifyShift({ data: { kind: "clock_out" } }).catch(() => {});
  };

  const startBreak = async (kind: BreakKind) => {
    if (!shift || brk) return;
    setBusy(true);
    const { error } = await supabase
      .from("breaks")
      .insert({ shift_id: shift.id, user_id: user!.id, kind });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "lunch" ? "Lunch started" : "Break started");
    notifyBreak({ data: { kind: "start", breakKind: kind } }).catch(() => {});
  };

  const endBreak = async () => {
    if (!brk) return;
    setBusy(true);
    const { error } = await supabase
      .from("breaks")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", brk.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Break ended");
    notifyBreak({ data: { kind: "end", breakKind: brk.kind } }).catch(() => {});
  };

  if (!user) return null;

  const STAFF_ROLE_PRIORITY: AppRole[] = ["admin", "management", "moderator", "staff"];
  const staffRole = STAFF_ROLE_PRIORITY.find((r) => roles.includes(r));
  // Working status is a staff-only tool — hide the whole box from regular members.
  if (!staffRole) return null;
  const staffRoleLabel = formatRoleLabel(staffRole);

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "User";

  // DND overrides all other status — show a dedicated DND card.
  if (dnd?.active) {
    const until = dnd.endsAt
      ? dnd.endsAt.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : null;
    return (
      <section className="px-2 pt-4">
        <div className="rounded-lg bg-surface-2/60 border border-violet-500/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/30 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10">
            <div className="flex items-center gap-2">
              <Moon className="size-3.5 text-violet-300" />
              <h2 className="font-display text-[11px] font-bold tracking-wider uppercase text-violet-200">
                Do Not Disturb
              </h2>
              <DndCountdown userId={user.id} compact />
            </div>
          </div>
          <div className="px-3 py-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 pb-1 border-b border-violet-500/30">
              <span className="font-display font-semibold text-sm text-violet-100">
                {displayName}
              </span>
              {staffRoleLabel && (
                <span className="inline-flex items-center rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 ring-1 ring-violet-500/30">
                  {staffRoleLabel}
                </span>
              )}
            </div>
            {dnd.note && <p className="text-foreground/90">{dnd.note}</p>}
            {until && (
              <p className="text-muted-foreground">
                Until <span className="tabular-nums text-foreground/80">{until}</span>
              </p>
            )}
            {!dnd.note && !until && <p className="text-muted-foreground">Notifications muted.</p>}
          </div>
        </div>
      </section>
    );
  }

  const shiftSec = shift ? (now - new Date(shift.clock_in).getTime()) / 1000 : 0;
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
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const ActionIcons = () => {
    if (busy) {
      return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
    }
    if (!shift) {
      return (
        <button
          type="button"
          onClick={clockIn}
          title="Sign in"
          className="inline-flex items-center justify-center size-10 rounded-full border border-success/30 bg-success/10 text-success hover:bg-success/20 transition-all"
        >
          <LogIn className="size-5" />
        </button>
      );
    }
    if (brk) {
      return (
        <button
          type="button"
          onClick={endBreak}
          title="End break"
          className="inline-flex items-center justify-center size-10 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
        >
          <PlayCircle className="size-5" />
        </button>
      );
    }
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => startBreak("break")}
          title="Take a break"
          className="inline-flex items-center justify-center size-10 rounded-full border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 transition-all"
        >
          <Coffee className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => startBreak("lunch")}
          title="Start lunch"
          className="inline-flex items-center justify-center size-10 rounded-full border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-all"
        >
          <UtensilsCrossed className="size-5" />
        </button>
        <button
          type="button"
          onClick={clockOut}
          title="Sign out"
          className="inline-flex items-center justify-center size-10 rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
        >
          <LogOut className="size-5" />
        </button>
      </div>
    );
  };

  return (
    <section className="px-2 pt-4">
      <div className="rounded-2xl bg-card border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-success/80 to-primary/80">
          <div className="flex items-center gap-2.5">
            <Briefcase className="size-5 text-white/90" />
            <h2 className="font-display text-[11px] font-bold tracking-widest uppercase text-white">
              Working Status
            </h2>
          </div>
          <div className="flex items-center gap-2.5 text-white/80">
            <Link
              to="/clock"
              title="Clock page"
              className="inline-flex items-center justify-center size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <Clock className="size-4" />
            </Link>
            <Link
              to="/shifts"
              title="Shifts"
              className="inline-flex items-center justify-center size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <Calendar className="size-4" />
            </Link>
          </div>
        </div>
        <div className="px-5 py-5 space-y-4 text-sm">
          <div
            className={cn(
              "gap-4 pb-4 border-b border-white/10",
              stackActions ? "flex flex-col items-start" : "flex items-center justify-between",
            )}
          >
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="font-display font-bold text-lg text-foreground truncate">
                {displayName}
              </span>
              {staffRoleLabel && (
                <span className="inline-flex items-center self-start rounded-full bg-warning px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-background shadow-lg shadow-warning/20">
                  {staffRoleLabel}
                </span>
              )}
            </div>
            <ActionIcons />
          </div>
          {shift ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium">Shift</span>
              <span className="inline-flex items-center gap-1.5 font-bold tabular-nums text-success text-lg">
                <CircleDot className="size-5" />
                {fmtHM(shiftSec)}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Shift</span>
                <span className="text-muted-foreground italic">Not signed in</span>
              </div>
              {nextSlot && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground font-medium">Next shift</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-semibold tabular-nums text-primary ring-1 ring-primary/40">
                    <Calendar className="size-3.5" />
                    {new Date(`${nextSlot.shift_date}T00:00:00`).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {nextSlot.start_time.slice(0, 5)}–{nextSlot.end_time.slice(0, 5)}
                  </span>
                </div>
              )}
            </>
          )}
          {brk && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-medium">{breakLabel(brk.kind)}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold tabular-nums ring-1",
                  over
                    ? "bg-destructive/15 text-destructive ring-destructive/40"
                    : "bg-warning/15 text-warning ring-warning/40",
                )}
              >
                {(() => {
                  const Icon = breakIcon(brk.kind);
                  return <Icon className="size-3.5" />;
                })()}
                {over ? `+${fmtMS(-brRemain)}` : fmtMS(brRemain)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { CircleDot, Briefcase, LogIn, LogOut, Coffee, UtensilsCrossed, PlayCircle, Loader2, Calendar, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useDndStatus } from "@/hooks/use-dnd";
import { Moon } from "lucide-react";
import { DndCountdown } from "@/components/app/DndCountdown";
import { type BreakKind, BREAK_LIMITS as LIMITS, breakLabel, breakIcon } from "@/lib/breaks";
import { useServerFn } from "@tanstack/react-start";
import { sendShiftEventPush, sendBreakEventPush } from "@/lib/push.functions";
import { toast } from "sonner";
import { formatRoleLabel } from "@/lib/role-label";

type Shift = { id: string; clock_in: string };
type Break = { id: string; kind: BreakKind; started_at: string };

export function WorkingStatusBox({ stackActions = false }: { stackActions?: boolean } = {}) {
  const { user, roles } = useAuth();
  const dnd = useDndStatus(user?.id);
  const notifyShift = useServerFn(sendShiftEventPush);
  const notifyBreak = useServerFn(sendBreakEventPush);
  const [shift, setShift] = useState<Shift | null>(null);
  const [brk, setBrk] = useState<Break | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data: s } = await supabase
        .from("shifts").select("id,clock_in")
        .eq("user_id", user.id).is("clock_out", null)
        .order("clock_in", { ascending: true }).limit(1).maybeSingle();
      setShift((s as Shift) ?? null);
      if (s) {
        const { data: b } = await supabase
          .from("breaks").select("id,kind,started_at")
          .eq("shift_id", (s as Shift).id).is("ended_at", null)
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
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
    const { error } = await supabase.from("shifts").update({ clock_out: new Date().toISOString() }).eq("id", shift.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    notifyShift({ data: { kind: "clock_out" } }).catch(() => {});
  };

  const startBreak = async (kind: BreakKind) => {
    if (!shift || brk) return;
    setBusy(true);
    const { error } = await supabase.from("breaks").insert({ shift_id: shift.id, user_id: user!.id, kind });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "lunch" ? "Lunch started" : "Break started");
    notifyBreak({ data: { kind: "start", breakKind: kind } }).catch(() => {});
  };

  const endBreak = async () => {
    if (!brk) return;
    setBusy(true);
    const { error } = await supabase.from("breaks").update({ ended_at: new Date().toISOString() }).eq("id", brk.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Break ended");
    notifyBreak({ data: { kind: "end", breakKind: brk.kind } }).catch(() => {});
  };

  if (!user) return null;

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "User";

  const STAFF_ROLE_PRIORITY: AppRole[] = ["admin", "management", "moderator", "staff"];
  const staffRole = STAFF_ROLE_PRIORITY.find((r) => roles.includes(r));
  const staffRoleLabel = formatRoleLabel(staffRole);

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
              <h2 className="font-display text-[11px] font-bold tracking-wider uppercase text-violet-200">Do Not Disturb</h2>
              <DndCountdown userId={user.id} compact />
            </div>
          </div>
          <div className="px-3 py-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 pb-1 border-b border-violet-500/30">
              <span className="font-display font-semibold text-sm text-violet-100">{displayName}</span>
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
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const ActionIcons = () => {
    if (busy) {
      return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
    }
    if (!shift) {
      return (
        <button
          type="button"
          onClick={clockIn}
          title="Sign in"
          className="inline-flex items-center justify-center size-6 rounded-md bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25 transition"
        >
          <LogIn className="size-3.5" />
        </button>
      );
    }
    if (brk) {
      return (
        <button
          type="button"
          onClick={endBreak}
          title="End break"
          className="inline-flex items-center justify-center size-6 rounded-md bg-primary/15 text-primary ring-1 ring-primary/40 hover:bg-primary/25 transition"
        >
          <PlayCircle className="size-3.5" />
        </button>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => startBreak("break")}
          title="Take a break"
          className="inline-flex items-center justify-center size-6 rounded-md bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40 hover:bg-amber-500/25 transition"
        >
          <Coffee className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => startBreak("lunch")}
          title="Start lunch"
          className="inline-flex items-center justify-center size-6 rounded-md bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/40 hover:bg-orange-500/25 transition"
        >
          <UtensilsCrossed className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={clockOut}
          title="Sign out"
          className="inline-flex items-center justify-center size-6 rounded-md bg-destructive/15 text-destructive ring-1 ring-destructive/40 hover:bg-destructive/25 transition"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  };

  return (
    <section className="px-2 pt-4">
      <div className="rounded-lg bg-surface-2/60 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-emerald-600/10 via-amber-600/10 to-rose-600/10">
          <div className="flex items-center gap-2">
            <Briefcase className="size-3.5 text-emerald-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">Working Status</h2>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/clock"
              title="Clock page"
              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
            >
              <Clock className="size-3.5" />
            </Link>
            <Link
              to="/shifts"
              title="Shifts"
              className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
            >
              <Calendar className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="px-3 py-3 space-y-2 text-xs">
          <div className={cn("gap-2 pb-1 border-b border-border/60", stackActions ? "flex flex-col items-start" : "flex items-center justify-between")}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display font-semibold text-sm text-foreground truncate">{displayName}</span>
              {staffRoleLabel && (
                <span className="inline-flex items-center shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/40">
                  {staffRoleLabel}
                </span>
              )}
            </div>
            <ActionIcons />
          </div>
          {shift ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shift</span>
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-emerald-400">
                <CircleDot className="size-3" />
                {fmtHM(shiftSec)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shift</span>
              <span className="text-muted-foreground italic">Not signed in</span>
            </div>
          )}
          {brk && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{breakLabel(brk.kind)}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1",
                  over
                    ? "bg-destructive/15 text-destructive ring-destructive/40"
                    : "bg-amber-500/15 text-amber-400 ring-amber-500/40",
                )}
              >
                {(() => { const Icon = breakIcon(brk.kind); return <Icon className="size-3" />; })()}
                {over ? `+${fmtMS(-brRemain)}` : fmtMS(brRemain)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
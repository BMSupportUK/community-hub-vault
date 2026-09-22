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
import { browserTimezone } from "@/hooks/use-user-timezone";
import { shiftWindowToUtcMs } from "@/hooks/use-timezone";

type Shift = { id: string; clock_in: string };
type Break = { id: string; kind: BreakKind; started_at: string };
type NextSlot = { id: string; shift_date: string; start_time: string; end_time: string };

// Rota dates/times are UK office wall-clock, so always compare against London,
// never the staff member's device timezone.
function londonNow(at: number | Date = Date.now()) {
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
    minutes: Number(hour) * 60 + Number(get("minute")),
  };
}

// "Sign-in opens…" line — shows the person's own shift start in UK office time
// and, when their device is in another timezone, their local start time too.
function SignInOpensNote({ win }: { win: { start: string; end: string } }) {
  const [deviceTz, setDeviceTz] = useState(() => browserTimezone());
  useEffect(() => {
    const id = window.setInterval(() => setDeviceTz(browserTimezone()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const ukStart = win.start.slice(0, 5);
  let deviceText: string | null = null;
  if (deviceTz !== "Europe/London") {
    const { startsAt } = shiftWindowToUtcMs(londonNow().date, win.start, win.end, "Europe/London");
    deviceText = new Intl.DateTimeFormat("en-GB", {
      timeZone: deviceTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(startsAt);
  }
  return (
    <p className="text-xs text-muted-foreground">
      Sign-in opens 15 minutes before your shift starts ({ukStart} UK
      {deviceText ? ` · ${deviceText} your time` : ""}).
    </p>
  );
}

// Rota wall-clock (UK) converted into the viewer's device timezone. When the
// shift crosses midnight locally, start and end are listed as separate days.
export function NextShiftPanel({
  slot,
  heading = "Next shift",
  tone = "primary",
}: {
  slot: NextSlot;
  heading?: string;
  tone?: "primary" | "amber";
}) {
  const amber = tone === "amber";
  const [deviceTz, setDeviceTz] = useState(() => browserTimezone());
  useEffect(() => {
    const id = window.setInterval(() => setDeviceTz(browserTimezone()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { startsAt, endsAt } = shiftWindowToUtcMs(
    slot.shift_date,
    slot.start_time,
    slot.end_time,
    "Europe/London",
  );
  const fmtDate = (ms: number, tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(ms);
  const fmtTime = (ms: number, tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);

  const ukDate = fmtDate(startsAt, "Europe/London");
  const ukEndDate = fmtDate(endsAt, "Europe/London");
  const ukCrosses = ukDate !== ukEndDate;
  const showDevice = deviceTz !== "Europe/London";
  const devStartDate = fmtDate(startsAt, deviceTz);
  const devEndDate = fmtDate(endsAt, deviceTz);
  const devCrosses = devStartDate !== devEndDate;

  const Row = ({
    label,
    startDate,
    endDate,
    startTime,
    endTime,
    crosses,
    accent,
  }: {
    label: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    crosses: boolean;
    accent?: boolean;
  }) => (
    <div
      className={cn(
        "h-full rounded-lg px-2.5 py-2",
        amber ? "bg-amber-500/10 ring-1 ring-amber-300/25" : "bg-surface/60 ring-1 ring-border/60",
      )}
    >
      <div
        className={cn(
          "truncate text-[10px] font-semibold uppercase tracking-wide",
          accent ? "text-primary" : "text-muted-foreground",
        )}
        title={label}
      >
        {label}
      </div>
      {/* Two aligned columns: date on the left, time on the right, never wrapping. */}
      <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
        <span className={cn("whitespace-nowrap text-[10px] leading-tight", amber ? "text-amber-100/80" : "text-muted-foreground")}>
          {startDate}
        </span>
        <span className={cn("whitespace-nowrap font-mono text-[13px] font-semibold leading-tight tabular-nums", amber ? "text-white" : "text-foreground")}>
          {crosses ? startTime : `${startTime}–${endTime}`}
        </span>
        {crosses && (
          <>
            <div className="col-span-2 flex items-center gap-1.5">
              <span className={cn("h-px flex-1", amber ? "bg-amber-300/30" : "bg-border/70")} />
              <span className={cn("whitespace-nowrap text-[9px] uppercase tracking-wider", amber ? "text-amber-100/70" : "text-muted-foreground")}>
                next day
              </span>
              <span className={cn("h-px flex-1", amber ? "bg-amber-300/30" : "bg-border/70")} />
            </div>
            <span className={cn("whitespace-nowrap text-[10px] leading-tight", amber ? "text-amber-100/80" : "text-muted-foreground")}>
              {endDate}
            </span>
            <span className={cn("whitespace-nowrap font-mono text-[13px] font-semibold leading-tight tabular-nums", amber ? "text-white" : "text-foreground")}>
              {endTime}
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border p-2.5",
        amber ? "border-amber-300/30 bg-amber-500/15 shadow-[0_0_10px_rgba(245,158,11,0.15)]" : "border-primary/30 bg-primary/5",
      )}
    >
      <div className={cn("mb-2 flex items-center gap-1.5", amber ? "text-amber-300" : "text-primary")}>
        <Calendar className="size-3.5" />
        <span className="text-xs font-bold uppercase tracking-wide">{heading}</span>
      </div>
      {/* Stacked full-width rows — side-by-side columns overflow in narrow panels. */}
      <div className="grid gap-2">
        <Row
          label="UK office"
          startDate={ukDate}
          endDate={ukEndDate}
          startTime={slot.start_time.slice(0, 5)}
          endTime={slot.end_time.slice(0, 5)}
          crosses={ukCrosses}
        />
        {showDevice && (
          <Row
            accent
            label={`Your time · ${deviceTz.split("/").pop()?.replace(/_/g, " ")}`}
            startDate={devStartDate}
            endDate={devEndDate}
            startTime={fmtTime(startsAt, deviceTz)}
            endTime={fmtTime(endsAt, deviceTz)}
            crosses={devCrosses}
          />
        )}
      </div>
    </div>
  );
}

export function WorkingStatusBox({
  stackActions = false,
  variant = "card",
}: {
  stackActions?: boolean;
  variant?: "card" | "header";
} = {}) {
  const { user, roles } = useAuth();
  const dnd = useDndStatus(user?.id);
  const notifyShift = useServerFn(sendShiftEventPush);
  const notifyBreak = useServerFn(sendBreakEventPush);
  const [shift, setShift] = useState<Shift | null>(null);
  const [brk, setBrk] = useState<Break | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [nextSlot, setNextSlot] = useState<NextSlot | null>(null);
  // Today's rota window: earliest slot start and latest slot end (HH:MM:SS).
  const [todayWindow, setTodayWindow] = useState<{ start: string; end: string } | null>(null);
  const [hadShiftToday, setHadShiftToday] = useState(false);

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
      const london = londonNow();
      const todayStr = london.date;
      const nowTime = london.time;
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
      // Staff can only sign in on a day they are on the rota — applies to every role.
      // Use THEIR next shift today (first one that hasn't ended yet) so the
      // sign-in gate and message match each person's actual start time, not
      // just the earliest slot of the day.
      const todays = ((slots ?? []) as NextSlot[]).filter((sl) => sl.shift_date === todayStr);
      const upcomingToday = todays
        .filter((sl) => sl.end_time > nowTime)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      setHadShiftToday(todays.length > 0);
      setTodayWindow(
        upcomingToday
          ? { start: upcomingToday.start_time, end: upcomingToday.end_time }
          : null,
      );
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

  // Sign-in opens 15 minutes before the rota start time and closes at shift end.
  // Compared in UK office time so staff on other device timezones get the same window.
  const canSignIn = (() => {
    if (!todayWindow) return false;
    const [sh, sm] = todayWindow.start.split(":").map(Number);
    const { time: nowTime, minutes: nowMinutes } = londonNow(now);
    const opensAtMinutes = sh * 60 + sm - 15;
    return nowMinutes >= opensAtMinutes && nowTime <= todayWindow.end;
  })();

  const clockIn = async () => {
    if (!user) return;
    if (!todayWindow) {
      toast.error("You have no shift on the rota today, so you can't sign in.");
      return;
    }
    if (!canSignIn) {
      toast.error("Sign-in opens 15 minutes before your shift starts.");
      return;
    }
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
    if (!user || !shift || brk) return;
    setBusy(true);
    const { error } = await supabase
      .from("breaks")
      .insert({ shift_id: shift.id, user_id: user.id, kind });
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

  // DND overrides the card status, while the talk-channel header keeps its controls available.
  if (dnd?.active && variant === "card") {
    const until = dnd.endsAt
      ? dnd.endsAt.toLocaleString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return (
      <section className="px-2 pt-4">
        <div className="rounded-lg bg-surface-2/60 border border-violet-500/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/30 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10">
            <div className="flex items-center gap-2">
              <Moon className="size-3.5 text-violet-300" />
              <h2 className="font-display text-[11px] font-bold tracking-wider uppercase text-violet-200">
                Away
              </h2>
              <DndCountdown userId={user.id} compact />
            </div>
            <DndDialogButton
              icon="pencil"
              className="inline-flex items-center justify-center size-7 rounded-full p-0 text-violet-200 hover:text-white hover:bg-violet-500/30 transition"
            />
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

  const ActionIcons = ({ compact = false }: { compact?: boolean }) => {
    const iconButtonClass = compact ? "size-8" : "size-10";
    const iconClass = compact ? "size-4" : "size-5";
    if (busy) {
      return <Loader2 className={cn(iconClass, "animate-spin text-muted-foreground")} />;
    }
    if (!shift) {
      return (
        <button
          type="button"
          onClick={clockIn}
          disabled={!canSignIn}
          title={
            canSignIn
              ? "Sign in"
              : todayWindow
                ? "Sign-in opens 15 minutes before your shift"
                : "No shift on the rota today"
          }
          className={cn(
            "inline-flex items-center justify-center rounded-full border transition-all",
            canSignIn
              ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
              : "border-white/10 bg-white/5 text-muted-foreground cursor-not-allowed opacity-60",
            iconButtonClass,
          )}
        >
          <LogIn className={iconClass} />
        </button>
      );
    }
    if (brk) {
      return (
        <button
          type="button"
          onClick={endBreak}
          title="End break"
          className={cn("inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all", iconButtonClass)}
        >
          <PlayCircle className={iconClass} />
        </button>
      );
    }
    return (
      <div className={cn("flex items-center", compact ? "gap-1" : "gap-3")}>
        <button
          type="button"
          onClick={() => startBreak("break")}
          title="Take a break"
          className={cn("inline-flex items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 transition-all", iconButtonClass)}
        >
          <Coffee className={iconClass} />
        </button>
        <button
          type="button"
          onClick={() => startBreak("lunch")}
          title="Start lunch"
          className={cn("inline-flex items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-all", iconButtonClass)}
        >
          <UtensilsCrossed className={iconClass} />
        </button>
        <button
          type="button"
          onClick={clockOut}
          title="Sign out"
          className={cn("inline-flex items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all", iconButtonClass)}
        >
          <LogOut className={iconClass} />
        </button>
      </div>
    );
  };

  if (variant === "header") {
    return (
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border/70 pr-2" aria-label="Staff Shift Controls">
        <span className="font-display text-[10px] font-bold tracking-wider uppercase text-muted-foreground whitespace-nowrap hidden lg:inline">
          Staff Shift Controls
        </span>
        <ActionIcons compact />
        <Link
          to="/clock"
          title="Clock page"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <Clock className="size-4" />
        </Link>
        <Link
          to="/shifts"
          title="Shifts"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <Calendar className="size-4" />
        </Link>
        <DndDialogButton className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground" />
      </div>
    );
  }

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
          <div className="flex flex-wrap items-center justify-end gap-2 text-white/80">
            <Link
              to="/clock"
              title="Clock page"
              className="inline-flex shrink-0 items-center justify-center size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <Clock className="size-4" />
            </Link>
            <Link
              to="/shifts"
              title="Shifts"
              className="inline-flex shrink-0 items-center justify-center size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              <Calendar className="size-4" />
            </Link>
            <DndDialogButton className="inline-flex shrink-0 items-center justify-center size-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition" />
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
              {!todayWindow && !hadShiftToday && (
                <p className="text-xs text-muted-foreground">
                  You're not on the rota today, so signing in is unavailable.
                </p>
              )}
              {!todayWindow && hadShiftToday && (
                <p className="text-xs text-muted-foreground">
                  Today's shift has ended — your next shift is below.
                </p>
              )}
              {todayWindow && !canSignIn && <SignInOpensNote win={todayWindow} />}
              {nextSlot && <NextShiftPanel slot={nextSlot} />}
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

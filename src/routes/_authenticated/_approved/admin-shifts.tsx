import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Clock as ClockIcon, Hourglass, Loader2, LogIn, LogOut, RefreshCw, TimerReset, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type BreakKind, breakIcon, breakLabel } from "@/lib/breaks";
import { awayForShift, awayIcon } from "@/lib/staff-away";
import { EarlyFinishRequestsPanel } from "@/components/app/EarlyFinishRequestsPanel";
import { ShiftBreakdownCard } from "@/components/app/ShiftBreakdownCard";
import { shiftBreakdown } from "@/lib/shift-breakdown";

export const Route = createFileRoute("/_authenticated/_approved/admin-shifts")({
  component: StaffShiftsPage,
  head: () => ({
    meta: [
      { title: "Staff shifts — BM Support admin" },
      { name: "description", content: "Every staff shift, clock-in, clock-out and auto clock-out grouped by day." },
      { property: "og:title", content: "Staff shifts — BM Support admin" },
      { property: "og:description", content: "Every staff shift, clock-in, clock-out and auto clock-out grouped by day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const AUTO_OUT_GRACE_MS = 15 * 60 * 1000;

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

interface ShiftRow {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  end_prompt_asked_at: string | null;
  still_working_ack_at: string | null;
  early_finish_at: string | null;
  early_finish_reason: string | null;
}

interface BreakRow {
  id: string;
  shift_id: string;
  kind: BreakKind;
  started_at: string;
  ended_at: string | null;
}

/** One logged Away period, written by the away_log trigger. */
interface AwayRow {
  id: string;
  user_id: string;
  reason: string;
  starts_at: string;
  ends_at: string | null;
}


interface PersonRow {
  id: string;
  display_name: string | null;
  username: string | null;
}

const ROLE_TABS = [
  { key: "admin", label: "Owner" },
  { key: "management", label: "Management" },
  { key: "staff", label: "Staff" },
  { key: "moderator", label: "Moderator" },
] as const;

type RoleKey = (typeof ROLE_TABS)[number]["key"];

/** Monday-first weekday tabs; value is the JS getDay() index. */
const DAY_TABS = [
  { key: 1, label: "Monday" },
  { key: 2, label: "Tuesday" },
  { key: 3, label: "Wednesday" },
  { key: 4, label: "Thursday" },
  { key: 5, label: "Friday" },
  { key: 6, label: "Saturday" },
  { key: 0, label: "Sunday" },
];

type DayKey = number;

const ROLE_ORDER: RoleKey[] = ["admin", "management", "staff", "moderator"];

const ROLE_LABEL: Record<string, string> = {
  admin: "Owner",
  management: "Management",
  staff: "Staff",
  moderator: "Moderator",
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDayHeading(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  const label = date.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Yesterday · ${label}`;
  return label;
}


function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function durationMs(startIso: string, endIso: string | null) {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, end - new Date(startIso).getTime());
}

function fmtMs(ms: number) {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isAutoOut(s: ShiftRow) {
  return (
    !!s.clock_out &&
    !!s.end_prompt_asked_at &&
    Math.abs(new Date(s.clock_out).getTime() - (new Date(s.end_prompt_asked_at).getTime() + AUTO_OUT_GRACE_MS)) < 60_000
  );
}

function Pill({ label, tone }: { label: string; tone: "ok" | "warn" | "muted" | "info" }) {
  const tones: Record<string, string> = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
    warn: "bg-amber-500/15 text-amber-300 border-amber-400/40",
    info: "bg-blue-500/15 text-blue-300 border-blue-400/40",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Users; tone: "primary" | "success" | "warning" | "accent" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    accent: "bg-accent/15 text-accent",
  };
  return (
    <div className="group rounded-2xl border border-border bg-surface-1 p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StaffShiftsPage() {
  const { hasAny } = useAuth();
  const canView = hasAny(["admin", "management", "staff", "moderator"]);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [breaksByShift, setBreaksByShift] = useState<Record<string, BreakRow[]>>({});
  const [awayByUser, setAwayByUser] = useState<Record<string, AwayRow[]>>({});
  const [people, setPeople] = useState<Record<string, PersonRow>>({});
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [role, setRole] = useState<RoleKey>("admin");
  const [weekday, setWeekday] = useState<DayKey>(new Date().getDay());

  const load = useCallback(async (d: number, silent = false) => {
    if (!silent) setLoading(true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (d - 1));
    const { data } = await supabase
      .from("shifts")
      .select("id, user_id, clock_in, clock_out, end_prompt_asked_at, still_working_ack_at, early_finish_at, early_finish_reason")
      .gte("clock_in", from.toISOString())
      .order("clock_in", { ascending: false });
    const rows = (data ?? []) as ShiftRow[];
    setShifts(rows);

    const ids = [...new Set(rows.map((r) => r.id))];
    const bmap: Record<string, BreakRow[]> = {};
    if (ids.length) {
      const { data: bd } = await supabase
        .from("breaks")
        .select("id, shift_id, kind, started_at, ended_at")
        .in("shift_id", ids)
        .order("started_at", { ascending: true });
      for (const b of (bd ?? []) as BreakRow[]) (bmap[b.shift_id] ??= []).push(b);
    }
    setBreaksByShift(bmap);

    // Away periods for the same people, matched to each shift when rendering.
    const awayIds = [...new Set(rows.map((r) => r.user_id))];
    const amap: Record<string, AwayRow[]> = {};
    if (awayIds.length) {
      const { data: ad } = await supabase
        .from("away_log")
        .select("id, user_id, reason, starts_at, ends_at")
        .in("user_id", awayIds)
        .or(`ends_at.is.null,ends_at.gt.${from.toISOString()}`)
        .order("starts_at", { ascending: true });
      for (const a of (ad ?? []) as AwayRow[]) (amap[a.user_id] ??= []).push(a);
    }
    setAwayByUser(amap);

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    if (userIds.length) {
      const { data: pd } = await supabase.from("profiles").select("id, display_name, username").in("id", userIds);
      const pmap: Record<string, PersonRow> = {};
      for (const p of (pd ?? []) as PersonRow[]) pmap[p.id] = p;
      setPeople(pmap);
      const { data: rd } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
      const rmap: Record<string, string[]> = {};
      for (const r of (rd ?? []) as { user_id: string; role: string }[]) (rmap[r.user_id] ??= []).push(r.role);
      setRolesByUser(rmap);
    } else {
      setPeople({});
      setRolesByUser({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canView) void load(days);
  }, [canView, days, load]);

  // Keep breaks/shifts live so lunch, break and travelling-home status changes
  // show without a hard refresh.
  useEffect(() => {
    if (!canView) return;
    const refresh = () => { void load(days, true); };
    const ch = supabase
      .channel(`admin-shifts-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "away_log" }, refresh)
      .subscribe();
    const poll = setInterval(refresh, 20_000);
    const onWake = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [canView, days, load]);

  const primaryRole = useCallback(
    (userId: string) => {
      const mine = rolesByUser[userId] ?? [];
      return ROLE_ORDER.find((r) => mine.includes(r)) ?? "other";
    },
    [rolesByUser],
  );

  const byWeekday = useMemo(
    () => shifts.filter((s) => new Date(s.clock_in).getDay() === weekday),
    [shifts, weekday],
  );

  const byRole = useMemo(
    () => shifts.filter((s) => primaryRole(s.user_id) === role),
    [shifts, role, primaryRole],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of byWeekday) counts[primaryRole(s.user_id)] = (counts[primaryRole(s.user_id)] ?? 0) + 1;
    return counts;
  }, [byWeekday, primaryRole]);

  const weekdayCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const s of byRole) {
      const d = new Date(s.clock_in).getDay();
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return counts;
  }, [byRole]);

  const visible = useMemo(
    () => byWeekday.filter((s) => primaryRole(s.user_id) === role),
    [byWeekday, role, primaryRole],
  );

  // day -> role -> shifts
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, ShiftRow[]>>();
    for (const s of visible) {
      const k = dayKey(s.clock_in);
      const byRole = map.get(k) ?? map.set(k, new Map()).get(k)!;
      const rk = primaryRole(s.user_id);
      (byRole.get(rk) ?? byRole.set(rk, []).get(rk)!).push(s);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, byRole]) => {
        const order = [...ROLE_ORDER, "other"];
        const sections = [...byRole.entries()].sort((a, b) => order.indexOf(a[0] as any) - order.indexOf(b[0] as any));
        return [key, sections] as const;
      });
  }, [visible, primaryRole]);


  const totals = useMemo(() => {
    let worked = 0;
    let open = 0;
    let auto = 0;
    for (const s of visible) {
      worked += shiftBreakdown(s, breaksByShift[s.id] ?? [], awayByUser[s.user_id] ?? []).workedMs;
      if (!s.clock_out) open += 1;
      if (isAutoOut(s)) auto += 1;
    }
    return {
      shifts: visible.length,
      staff: new Set(visible.map((s) => s.user_id)).size,
      worked,
      open,
      auto,
    };
  }, [visible, breaksByShift, awayByUser]);

  if (!canView) return <Navigate to="/admin" />;

  const nameOf = (userId: string) => {
    const p = people[userId];
    return p?.display_name || p?.username || "Unknown staff member";
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <EarlyFinishRequestsPanel />
      <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-surface-1 to-accent/10 p-5 shadow-sm md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full bg-accent/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-white shadow-lg">
            <Users className="size-6" />
          </span>
          <div className="min-w-0">
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back to admin
            </Link>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Staff shifts</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground md:text-sm">
              Clock-ins, breaks, away time and auto clock-outs — grouped by day so you never have to open each profile.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background/60 p-1 backdrop-blur">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    days === r.days ? "bg-gradient-primary text-white shadow" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button size="icon" variant="outline" className="rounded-xl" onClick={() => void load(days)} disabled={loading} aria-label="Refresh shifts">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { tabs: ROLE_TABS, counts: roleCounts, current: role, set: (k: any) => setRole(k), label: "Role" },
          { tabs: DAY_TABS, counts: weekdayCounts, current: weekday, set: (k: any) => setWeekday(k), label: "Day" },
        ].map((group) => (
          <div key={group.label} className="rounded-2xl border border-border bg-surface-1 p-2 shadow-sm">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group.label}</p>
            <div className="flex flex-wrap gap-1">
              {group.tabs.map((t) => {
                const count = (group.counts as Record<string | number, number>)[t.key] ?? 0;
                const active = group.current === t.key;
                return (
                  <button
                    key={String(t.key)}
                    type="button"
                    onClick={() => group.set(t.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
                      active ? "bg-gradient-primary text-white shadow" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {t.label}
                    <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_15rem]">
      <aside className="order-first xl:order-last">
        <div className="grid gap-3 sm:grid-cols-2 xl:sticky xl:top-4 xl:grid-cols-1">
          <StatCard label="Shifts" value={totals.shifts.toLocaleString("en-GB")} icon={CalendarDays} tone="primary" />
          <StatCard label="Staff" value={totals.staff.toLocaleString("en-GB")} icon={Users} tone="accent" />
          <StatCard label="Hours worked" value={fmtMs(totals.worked)} icon={Hourglass} tone="success" />
          <StatCard label="Still on shift" value={totals.open.toLocaleString("en-GB")} icon={UserCheck} tone="success" />
          <StatCard label="Auto clocked out" value={totals.auto.toLocaleString("en-GB")} icon={TimerReset} tone="warning" />
        </div>
      </aside>

      <div className="min-w-0">
      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-muted-foreground">
          <Loader2 className="size-5 mx-auto animate-spin mb-2" />
          Loading staff shifts…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-muted-foreground">
          No shifts recorded in this period.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, sections]) => {
            const dayRows = sections.flatMap(([, r]) => r);
            return (
            <section key={key} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-6 w-1 rounded-full bg-gradient-primary" />
                <h2 className="font-display text-lg font-bold tracking-tight">{fmtDayHeading(key)}</h2>
                <span className="rounded-full border border-border bg-surface-1 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {dayRows.length} shift{dayRows.length === 1 ? "" : "s"} ·{" "}
                  {fmtMs(dayRows.reduce((a, s) => a + shiftBreakdown(s, breaksByShift[s.id] ?? [], awayByUser[s.user_id] ?? []).workedMs, 0))} worked
                </span>
              </div>
              {sections.map(([roleKey, rows]) => (
                <div key={roleKey} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                      {ROLE_LABEL[roleKey] ?? "Other"}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {rows.length} shift{rows.length === 1 ? "" : "s"} ·{" "}
                      {fmtMs(rows.reduce((a, s) => a + shiftBreakdown(s, breaksByShift[s.id] ?? [], awayByUser[s.user_id] ?? []).workedMs, 0))} worked
                    </span>
                  </div>
                  <div className="grid gap-4 2xl:grid-cols-2">
                {rows.map((s) => {
                  const open = !s.clock_out;
                  const auto = isAutoOut(s);
                  const p = people[s.user_id];
                  return (
                    <div key={s.id} className="grid min-w-0 gap-3 xl:grid-cols-2">
                    <div
                      className={cn(
                        "rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md",
                        open ? "border-emerald-400/40 bg-emerald-500/5" : "border-border bg-surface-1",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
                              open ? "bg-emerald-500/20 text-emerald-300" : "bg-primary/15 text-primary",
                            )}
                            aria-hidden
                          >
                            {nameOf(s.user_id).slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                          {p?.username ? (
                            <Link
                              to="/u/$username"
                              params={{ username: p.username }}
                              search={{ tab: "shifts" } as any}
                              className="font-semibold hover:text-primary truncate block"
                            >
                              {nameOf(s.user_id)}
                            </Link>
                          ) : (
                            <p className="font-semibold truncate">{nameOf(s.user_id)}</p>
                          )}
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {fmtMs(durationMs(s.clock_in, s.clock_out))}
                            {open ? " on shift so far" : " on shift"}
                          </p>
                          </div>
                        </div>
                        {open ? (
                          <Pill label="On shift" tone="ok" />
                        ) : s.early_finish_at ? (
                          <Pill label="Early finish" tone="warn" />
                        ) : auto ? (
                          <Pill label="Auto clocked out" tone="warn" />
                        ) : (
                          <Pill label="Completed" tone="muted" />
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <LogIn className="size-4 text-emerald-400" />
                          <span className="text-muted-foreground">Clocked in</span>
                          <span className="ml-auto font-medium tabular-nums">{fmtTime(s.clock_in)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <LogOut className="size-4 text-rose-400" />
                          <span className="text-muted-foreground">Clocked out</span>
                          <span className="ml-auto font-medium tabular-nums">
                            {s.clock_out ? fmtTime(s.clock_out) : "—"}
                          </span>
                        </div>
                        {s.early_finish_at && (
                          <p className="text-xs text-warning">
                            Early finish approved{s.early_finish_reason ? ` · ${s.early_finish_reason}` : ""}
                          </p>
                        )}
                      </div>

                      {(breaksByShift[s.id] ?? []).length > 0 && (
                        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-sm">
                          {(breaksByShift[s.id] ?? []).map((b) => {
                            const BIcon = breakIcon(b.kind);
                            return (
                              <div key={b.id} className="flex items-center gap-2">
                                <BIcon className="size-4 text-amber-400" />
                                <span className="text-muted-foreground">{breakLabel(b.kind)}</span>
                                <span className="ml-auto font-medium tabular-nums">
                                  {fmtTime(b.started_at)} · {fmtMs(durationMs(b.started_at, b.ended_at))}
                                  {!b.ended_at ? " (ongoing)" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {awayForShift(awayByUser[s.user_id] ?? [], s).length > 0 && (
                        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-sm">
                          {awayForShift(awayByUser[s.user_id] ?? [], s).map((a) => (
                            <div key={a.id} className="flex items-center gap-2">
                              {(() => { const Icon = awayIcon(a.reason); return <Icon className="size-4 text-violet-400" />; })()}
                              <span className="text-muted-foreground">Away · {a.reason}</span>
                              <span className="ml-auto font-medium tabular-nums">
                                {fmtTime(a.starts_at)} · {fmtMs(durationMs(a.starts_at, a.ends_at))}
                                {!a.ends_at ? " (ongoing)" : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.end_prompt_asked_at ? (
                          <Pill label={`Asked “still working?” at ${fmtTime(s.end_prompt_asked_at)}`} tone="info" />
                        ) : (
                          <Pill label="Never asked" tone="muted" />
                        )}
                        {s.still_working_ack_at ? (
                          <Pill label={`Said still working at ${fmtTime(s.still_working_ack_at)}`} tone="ok" />
                        ) : s.end_prompt_asked_at ? (
                          <Pill label="No answer" tone="warn" />
                        ) : null}
                      </div>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ClockIcon className="size-3" /> Shift {s.id.slice(0, 8)}
                      </p>
                    </div>
                    <ShiftBreakdownCard shift={s} breaks={breaksByShift[s.id] ?? []} away={awayByUser[s.user_id] ?? []} username={p?.username} />
                    </div>
                  );
                 })}
                  </div>
                </div>
              ))}
            </section>
            );
          })}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

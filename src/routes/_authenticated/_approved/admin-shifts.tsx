import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock as ClockIcon, Loader2, LogIn, LogOut, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type BreakKind, breakIcon, breakLabel } from "@/lib/breaks";

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
}

interface BreakRow {
  id: string;
  shift_id: string;
  kind: BreakKind;
  started_at: string;
  ended_at: string | null;
}

interface PersonRow {
  id: string;
  display_name: string | null;
  username: string | null;
}

const ROLE_TABS = [
  { key: "all", label: "All roles" },
  { key: "admin", label: "Owner" },
  { key: "management", label: "Management" },
  { key: "staff", label: "Staff" },
  { key: "moderator", label: "Moderator" },
] as const;

type RoleKey = (typeof ROLE_TABS)[number]["key"];

const ROLE_ORDER: Exclude<RoleKey, "all">[] = ["admin", "management", "staff", "moderator"];

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
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
  const [people, setPeople] = useState<Record<string, PersonRow>>({});
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [role, setRole] = useState<RoleKey>("all");

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (d - 1));
    const { data } = await supabase
      .from("shifts")
      .select("id, user_id, clock_in, clock_out, end_prompt_asked_at, still_working_ack_at")
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

  const primaryRole = useCallback(
    (userId: string) => {
      const mine = rolesByUser[userId] ?? [];
      return ROLE_ORDER.find((r) => mine.includes(r)) ?? "other";
    },
    [rolesByUser],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of shifts) counts[primaryRole(s.user_id)] = (counts[primaryRole(s.user_id)] ?? 0) + 1;
    return counts;
  }, [shifts, primaryRole]);

  const visible = useMemo(
    () => (role === "all" ? shifts : shifts.filter((s) => primaryRole(s.user_id) === role)),
    [shifts, role, primaryRole],
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
      worked += durationMs(s.clock_in, s.clock_out);
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
  }, [visible]);

  if (!canView) return <Navigate to="/admin" />;

  const nameOf = (userId: string) => {
    const p = people[userId];
    return p?.display_name || p?.username || "Unknown staff member";
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-bold inline-flex items-center gap-2">
          <Users className="size-5 text-primary" /> Staff shifts
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {RANGES.map((r) => (
            <Button key={r.days} size="sm" variant={days === r.days ? "default" : "outline"} onClick={() => setDays(r.days)}>
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load(days)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        Every staff shift grouped by day, with clock-in and clock-out times, breaks, the
        &ldquo;still working?&rdquo; answer, and which shifts were clocked out automatically — so you
        don&apos;t have to open each profile.
      </p>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface-1 p-2">
        {ROLE_TABS.map((t) => {
          const count = t.key === "all" ? shifts.length : (roleCounts[t.key] ?? 0);
          const active = role === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setRole(t.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-gradient-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-white/20" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Shifts" value={totals.shifts.toLocaleString("en-GB")} />
        <StatCard label="Staff" value={totals.staff.toLocaleString("en-GB")} />
        <StatCard label="Hours worked" value={fmtMs(totals.worked)} />
        <StatCard label="Still on shift" value={totals.open.toLocaleString("en-GB")} />
        <StatCard label="Auto clocked out" value={totals.auto.toLocaleString("en-GB")} />
      </div>

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
          {grouped.map(([key, rows]) => (
            <section key={key} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold">{fmtDayHeading(key)}</h2>
                <span className="text-xs text-muted-foreground">
                  {rows.length} shift{rows.length === 1 ? "" : "s"} ·{" "}
                  {fmtMs(rows.reduce((a, s) => a + durationMs(s.clock_in, s.clock_out), 0))} worked
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {rows.map((s) => {
                  const open = !s.clock_out;
                  const auto = isAutoOut(s);
                  const p = people[s.user_id];
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-2xl border p-4",
                        open ? "border-emerald-400/40 bg-emerald-500/5" : "border-border bg-surface-1",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
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
                          <p className="text-xs text-muted-foreground">
                            {fmtMs(durationMs(s.clock_in, s.clock_out))}
                            {open ? " so far" : " worked"}
                          </p>
                        </div>
                        {open ? (
                          <Pill label="On shift" tone="ok" />
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
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

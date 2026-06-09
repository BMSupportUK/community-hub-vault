import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Loader2, Lock, Check, Star, Crown, Medal, Award, Pencil, CalendarDays } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listWcFixtures,
  upsertWcPrediction,
  getWcLeaderboard,
  getWcEntrantStatus,
  joinWcPredictor,
  type WcFixtureDTO,
  type WcLeaderboardRowDTO,
} from "@/lib/wc-predictions.functions";
import { teamFlag } from "@/lib/country-flags";
import heroBg from "@/assets/england-world-cup-hero.jpg";

export const Route = createFileRoute("/_authenticated/_approved/predictions")({
  component: PredictionsPage,
});

const STAGE_LABEL: Record<WcFixtureDTO["stage"], string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  third: "Third Place",
  final: "Final",
};

function formatKickoff(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, "0")}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function LockCountdownPill({ lockAtMs }: { lockAtMs: number }) {
  const now = useNow(1000);
  const remaining = lockAtMs - now;
  if (remaining <= 0) return null;
  const urgent = remaining <= 60 * 60 * 1000; // < 1h
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide tabular-nums border-2 shadow-md uppercase ${
        urgent
          ? "bg-amber-500/25 text-amber-200 border-amber-400/70 shadow-amber-500/30 animate-pulse"
          : "bg-primary/20 text-primary border-primary/50 shadow-primary/20"
      }`}
      title="Time left to predict (locks 30 min before kick-off)"
    >
      <Lock className="size-3.5" />
      {formatCountdown(remaining)} left
    </span>
  );
}

function PredictionsPage() {
  const { user } = useAuth();
  const [joined, setJoined] = useState<boolean>(false);
  const [joining, setJoining] = useState(false);
  const canPredict = joined;
  const [tab, setTab] = useState("fixtures");
  const [fixtures, setFixtures] = useState<WcFixtureDTO[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<WcLeaderboardRowDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  const listFixturesFn = useServerFn(listWcFixtures);
  const upsertFn = useServerFn(upsertWcPrediction);
  const leaderboardFn = useServerFn(getWcLeaderboard);
  const statusFn = useServerFn(getWcEntrantStatus);
  const joinFn = useServerFn(joinWcPredictor);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fx, lb, st] = await Promise.all([listFixturesFn(), leaderboardFn(), statusFn()]);
      setFixtures(fx);
      setLeaderboard(lb);
      setJoined(st.joined);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinFn();
      setJoined(true);
      toast.success("You're in! Start predicting.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myStats = useMemo(() => {
    if (!user || !leaderboard) return null;
    return leaderboard.find((r) => r.userId === user.id) ?? null;
  }, [leaderboard, user]);

  const upcomingFixtures = useMemo(() => {
    if (!fixtures) return [];
    const now = Date.now();
    const end = now + 3 * 24 * 60 * 60 * 1000;
    return fixtures
      .filter((f) => {
        const t = new Date(f.kickoffAt).getTime();
        return t >= now && t < end;
      })
      .sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt));
  }, [fixtures]);

  return (
    <main className="relative isolate flex-1 overflow-y-auto">
      {/* Full-page hero background (absolute so the parent's bg-background can't cover it) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-background/75 via-background/65 to-background/90"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-16 py-6">
        <header className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6 mb-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shadow-glow ring-1 ring-white/20">
              <Trophy className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">
                World Cup 2026 Predictor
              </h1>
              <p className="text-sm text-white/85">
                Predict every fixture. 5 pts exact score · 3 pts goal difference · 1 pt result.
              </p>
            </div>
            {myStats && (
              <div className="hidden sm:flex flex-col items-end text-white">
                <div className="text-xs uppercase tracking-wider text-white/70">Your points</div>
                <div className="font-display text-3xl font-bold leading-none">
                  {myStats.totalPoints}
                </div>
              </div>
            )}
          </div>
        </header>

        {!canPredict && (
          <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 text-sm">
              <div className="font-medium text-foreground">Join the predictor — it's free.</div>
              <div className="text-muted-foreground">
                Opt in to submit your scores and appear on the leaderboard. No payment, no commitment.
              </div>
            </div>
            <Button onClick={handleJoin} disabled={joining}>
              {joining ? <Loader2 className="size-4 animate-spin" /> : "Join the predictor"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto">
              <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="mine">My picks</TabsTrigger>
            </TabsList>

            <TabsContent value="fixtures" className="mt-4">
              {loading || !fixtures ? (
                <Loading />
              ) : (
                <FixturesList
                  fixtures={fixtures}
                  canPredict={canPredict}
                  onSave={async (fixtureId, hp, ap) => {
                    try {
                      await upsertFn({ data: { fixtureId, homePred: hp, awayPred: ap } });
                      toast.success("Prediction saved");
                      await loadAll();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Save failed");
                    }
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              {loading || !leaderboard ? (
                <Loading />
              ) : (
                <LeaderboardList rows={leaderboard} currentUserId={user?.id ?? null} />
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-4">
              {loading || !fixtures ? (
                <Loading />
              ) : (
                <MyPicks fixtures={fixtures.filter((f) => f.myPrediction)} />
              )}
            </TabsContent>
          </Tabs>

          <aside className="hidden lg:block">
            <UpcomingFixtures fixtures={upcomingFixtures} loading={loading} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function UpcomingFixtures({
  fixtures,
  loading,
}: {
  fixtures: WcFixtureDTO[];
  loading: boolean;
}) {
  return (
    <div className="sticky top-6 rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2">
        <CalendarDays className="size-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Next 3 days</h3>
        {fixtures.length > 0 && (
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            {fixtures.length} match{fixtures.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
      {loading ? (
        <div className="p-6 grid place-items-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : fixtures.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No matches in the next 3 days.
        </div>
      ) : (
        <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
          {fixtures.map((f) => {
            const t = new Date(f.kickoffAt);
            const kickoff = t.toLocaleString(undefined, {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            const lockMs = t.getTime() - 30 * 60 * 1000;
            const locked = Date.now() >= lockMs;
            const scored = f.homeScore !== null && f.awayScore !== null;
            return (
              <li key={f.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>
                    {STAGE_LABEL[f.stage]}
                    {f.groupLabel ? ` · ${f.groupLabel}` : ""}
                  </span>
                  <span className="font-mono tabular-nums">{kickoff}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    <span className="mr-1">{teamFlag(f.homeTeam)}</span>
                    {f.homeTeam}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                    {scored ? (
                      <span className="font-bold text-foreground">
                        {f.homeScore}–{f.awayScore}
                      </span>
                    ) : locked ? (
                      <Lock className="size-3" />
                    ) : (
                      "vs"
                    )}
                  </span>
                  <span className="font-medium truncate text-right">
                    {f.awayTeam}
                    <span className="ml-1">{teamFlag(f.awayTeam)}</span>
                  </span>
                </div>
                {f.myPrediction && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Your pick:{" "}
                      <span className="font-mono text-foreground">
                        {f.myPrediction.homePred}–{f.myPrediction.awayPred}
                      </span>
                    </span>
                    {scored && f.myPrediction.points !== null && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold tabular-nums uppercase tracking-wide">
                        +{f.myPrediction.points} pt
                        {f.myPrediction.points === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-20 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function FixturesList({
  fixtures,
  canPredict,
  onSave,
}: {
  fixtures: WcFixtureDTO[];
  canPredict: boolean;
  onSave: (fixtureId: string, hp: number, ap: number) => Promise<void>;
}) {
  const [filter, setFilter] = useState<string>("A"); // "A".."L" | "r32"…"final"

  const filtered = useMemo(() => {
    if (["r32", "r16", "qf", "sf", "third", "final"].includes(filter)) {
      return fixtures.filter((f) => f.stage === filter);
    }
    return fixtures.filter((f) => f.stage === "group" && f.groupLabel === filter);
  }, [fixtures, filter]);

  // group by date (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const m = new Map<string, WcFixtureDTO[]>();
    for (const f of filtered) {
      const d = new Date(f.kickoffAt).toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(f);
    }
    return m;
  }, [filtered]);

  if (!fixtures.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
        No fixtures yet. An admin can add them from the admin panel.
      </div>
    );
  }

  const groupLetters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const koRounds: { key: string; label: string }[] = [
    { key: "r32", label: "Round of 32" },
    { key: "r16", label: "Round of 16" },
    { key: "qf", label: "Quarter-finals" },
    { key: "sf", label: "Semi-finals" },
    { key: "third", label: "Third Place" },
    { key: "final", label: "Final" },
  ];
  const chip = (key: string, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition ${
        filter === key
          ? "bg-primary text-primary-foreground border-primary shadow-glow"
          : "bg-surface-1 text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
          {groupLetters.map((g) => chip(g, `Group ${g}`))}
        </div>
        <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
          <span className="self-center text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
            Knockouts
          </span>
          {koRounds.map((r) => chip(r.key, r.label))}
        </div>
      </div>
      {byDate.size === 0 && (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          No fixtures in this view yet.
        </div>
      )}
      {[...byDate.entries()].map(([date, items]) => (
        <div key={date}>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
            {date}
          </h2>
          <div className="grid gap-3">
            {items.map((f) => (
              <FixtureCard key={f.id} fixture={f} canPredict={canPredict} onSave={onSave} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FixtureCard({
  fixture,
  canPredict,
  onSave,
}: {
  fixture: WcFixtureDTO;
  canPredict: boolean;
  onSave: (fixtureId: string, hp: number, ap: number) => Promise<void>;
}) {
  const kickoffMs = new Date(fixture.kickoffAt).getTime();
  const LOCK_MS = 30 * 60 * 1000;
  const lockAtMs = kickoffMs - LOCK_MS;
  const locked = Date.now() >= lockAtMs;
  const scored = fixture.homeScore !== null && fixture.awayScore !== null;
  const [hp, setHp] = useState<string>(fixture.myPrediction?.homePred?.toString() ?? "");
  const [ap, setAp] = useState<string>(fixture.myPrediction?.awayPred?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const hasPick = !!fixture.myPrediction;
  // When user already has a saved pick, hide inputs behind an Edit button.
  const [editing, setEditing] = useState<boolean>(!hasPick);
  const showInputs = !locked && !scored && (editing || !hasPick);

  const dirty =
    !locked &&
    canPredict &&
    hp !== "" &&
    ap !== "" &&
    (Number(hp) !== fixture.myPrediction?.homePred ||
      Number(ap) !== fixture.myPrediction?.awayPred);

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await onSave(fixture.id, Number(hp), Number(ap));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setHp(fixture.myPrediction?.homePred?.toString() ?? "");
    setAp(fixture.myPrediction?.awayPred?.toString() ?? "");
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span className="inline-flex items-center gap-1.5">
          {STAGE_LABEL[fixture.stage]}
          {fixture.groupLabel && (
            <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">
              Group {fixture.groupLabel}
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-2">
          {!locked && !scored && <LockCountdownPill lockAtMs={lockAtMs} />}
          {formatKickoff(fixture.kickoffAt)}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right font-medium">
          <span className="mr-1.5">{teamFlag(fixture.homeTeam)}</span>
          {fixture.homeTeam}
        </div>
        {scored ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.homeScore} – {fixture.awayScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
              Final
            </div>
          </div>
        ) : locked ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-dashed border-border font-display text-lg font-bold tabular-nums text-muted-foreground">
              ? – ?
            </div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 mt-1 inline-flex items-center gap-1">
              <Lock className="size-3" /> Awaiting score
            </div>
          </div>
        ) : showInputs ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={hp}
              onChange={(e) => setHp(e.target.value.replace(/\D/g, "").slice(0, 2))}
              disabled={!canPredict || busy}
              inputMode="numeric"
              placeholder="–"
              className="w-12 text-center font-display text-lg font-bold"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              value={ap}
              onChange={(e) => setAp(e.target.value.replace(/\D/g, "").slice(0, 2))}
              disabled={!canPredict || busy}
              inputMode="numeric"
              placeholder="–"
              className="w-12 text-center font-display text-lg font-bold"
            />
          </div>
        ) : (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.myPrediction?.homePred} – {fixture.myPrediction?.awayPred}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
              Your pick
            </div>
          </div>
        )}
        <div className="font-medium">
          {fixture.awayTeam}
          <span className="ml-1.5">{teamFlag(fixture.awayTeam)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="text-muted-foreground">
          {fixture.myPrediction ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-emerald-400" />
              Your pick:{" "}
              <span className="font-mono text-foreground">
                {fixture.myPrediction.homePred} – {fixture.myPrediction.awayPred}
              </span>
              {fixture.myPrediction.points !== null && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                  {fixture.myPrediction.points} pt
                  {fixture.myPrediction.points === 1 ? "" : "s"}
                </span>
              )}
            </span>
          ) : locked ? (
            <span className="text-muted-foreground/70">No prediction submitted</span>
          ) : canPredict ? (
            <span>Enter a score to predict</span>
          ) : (
            <span>Join the predictor to enter</span>
          )}
        </div>
        {!locked && !scored && canPredict && (
          showInputs ? (
            <div className="flex items-center gap-1.5">
              {hasPick && (
                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={busy}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={!dirty || busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5 mr-1" /> Edit
            </Button>
          )
        )}
      </div>

      {/* Final-score status — always visible so users know where the auto-scored result will appear */}
      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground">Final score</span>
        {scored ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold tabular-nums">
            <Check className="size-3" />
            {fixture.homeScore} – {fixture.awayScore}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold uppercase tracking-wide">
            <Loader2 className="size-3 animate-spin" />
            Awaiting result
          </span>
        )}
      </div>
    </div>
  );
}

function LeaderboardList({
  rows,
  currentUserId,
}: {
  rows: WcLeaderboardRowDTO[];
  currentUserId: string | null;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
        No predictions yet — be the first to enter.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="grid grid-cols-[40px_1fr_70px_70px_70px] sm:grid-cols-[48px_1fr_80px_80px_80px_80px] gap-2 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2 border-b border-border">
        <div>#</div>
        <div>Player</div>
        <div className="text-right">Played</div>
        <div className="text-right hidden sm:block">Exact</div>
        <div className="text-right">Result</div>
        <div className="text-right">Points</div>
      </div>
      <ul>
        {rows.map((r, i) => {
          const rank = i + 1;
          const mine = r.userId === currentUserId;
          return (
            <li
              key={r.userId}
              className={`grid grid-cols-[40px_1fr_70px_70px_70px] sm:grid-cols-[48px_1fr_80px_80px_80px_80px] gap-2 px-4 py-2.5 text-sm border-b border-border last:border-b-0 ${
                mine ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center">
                {rank === 1 ? (
                  <Crown className="size-4 text-yellow-400" />
                ) : rank === 2 ? (
                  <Medal className="size-4 text-zinc-300" />
                ) : rank === 3 ? (
                  <Award className="size-4 text-amber-600" />
                ) : (
                  <span className="text-muted-foreground tabular-nums">{rank}</span>
                )}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {r.avatarUrl ? (
                  <img
                    src={r.avatarUrl}
                    alt=""
                    className="size-7 rounded-full object-cover bg-surface-2"
                  />
                ) : (
                  <div className="size-7 rounded-full bg-surface-2" />
                )}
                <span className="truncate font-medium">
                  {r.displayName || r.username || "Anonymous"}
                  {mine && (
                    <span className="ml-2 text-[10px] uppercase text-primary">you</span>
                  )}
                </span>
              </div>
              <div className="text-right tabular-nums">{r.predictionsMade}</div>
              <div className="text-right tabular-nums hidden sm:flex items-center justify-end gap-1">
                <Star className="size-3 text-yellow-400" /> {r.exactCount}
              </div>
              <div className="text-right tabular-nums">{r.resultCount}</div>
              <div className="text-right font-display font-bold tabular-nums">
                {r.totalPoints}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MyPicks({ fixtures }: { fixtures: WcFixtureDTO[] }) {
  if (!fixtures.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
        You haven't made any predictions yet.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden divide-y divide-border">
      {fixtures.map((f) => (
        <div key={f.id} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              <span className="mr-1">{teamFlag(f.homeTeam)}</span>
              {f.homeTeam} <span className="text-muted-foreground">vs</span> {f.awayTeam}
              <span className="ml-1">{teamFlag(f.awayTeam)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {STAGE_LABEL[f.stage]}
              {f.groupLabel ? ` · Group ${f.groupLabel}` : ""} · {formatKickoff(f.kickoffAt)}
            </div>
          </div>
          <div className="text-sm font-mono tabular-nums">
            <span className="text-muted-foreground text-xs">pick</span>{" "}
            <span className="font-bold">
              {f.myPrediction!.homePred} – {f.myPrediction!.awayPred}
            </span>
            {f.homeScore !== null && f.awayScore !== null && (
              <span className="ml-3 text-muted-foreground text-xs">
                final{" "}
                <span className="text-foreground font-bold">
                  {f.homeScore} – {f.awayScore}
                </span>
              </span>
            )}
          </div>
          <div className="text-right">
            {f.myPrediction!.points !== null ? (
              <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-medium">
                {f.myPrediction!.points} pt{f.myPrediction!.points === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">pending</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shirt, Loader2, Lock, LogOut, Crown, Star, ArrowRightLeft, Trophy, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import riversideBg from "@/assets/riverside-stadium-bg.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WinnersTab } from "@/components/app/WinnersTab";
import { LandingHeader } from "@/components/LandingHeader";
import { IconRail } from "@/components/app/IconRail";
import { useAuth } from "@/hooks/use-auth";
import {
  FANTASY_BENCH_SIZE, FANTASY_SQUAD_SIZE, FORMATION_KEYS, POSITION_ORDER,
  POSITION_SHORT, SCORING_RULES, SQUAD_QUOTA, formationCounts,
  type FantasyPosition, type FormationKey,
} from "@/lib/fantasy-rules";
import {
  getFantasyState, getFantasyLeaderboard, joinFantasyGame, saveFantasySquad,
  type FantasyStateDTO, type FantasyPlayerDTO, type FantasyLeaderboardRow,
} from "@/lib/fantasy.functions";
import {
  fantasyGuestRegister, fantasyGuestSignInExisting, getPublicFantasyState,
  getPublicFantasyLeaderboard, saveGuestFantasySquad, requestFantasyGuestPinReset,
  resetFantasyGuestPin,
} from "@/lib/fantasy-guest.functions";

export const Route = createFileRoute("/boro-fantasy")({
  head: () => ({
    meta: [
      { title: "MFC Fantasy Manager — Middlesbrough Fantasy Football" },
      { name: "description", content: "Build a Middlesbrough-only fantasy squad on a £30m budget, pick your formation and captain, and climb the MFC Fantasy Manager leaderboard." },
      { property: "og:title", content: "MFC Fantasy Manager — Middlesbrough Fantasy Football" },
      { property: "og:description", content: "Middlesbrough-only fantasy football: £30m budget, real formations, weekly scoring and prizes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BoroFantasyPage,
});

type GuestSession = { guestId: string; email: string; pin: string; displayName: string; teamName?: string };
const GUEST_KEY = "fantasy_guest_session";

const money = (m: number) => `£${m.toFixed(1)}m`;
const kickoffLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Loading() {
  return <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
}

function BoroFantasyPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("squad");
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) setGuest(JSON.parse(raw) as GuestSession);
    } catch { /* ignore */ }
  }, []);

  const stateFn = useServerFn(getFantasyState);
  const publicStateFn = useServerFn(getPublicFantasyState);
  const lbFn = useServerFn(getFantasyLeaderboard);
  const publicLbFn = useServerFn(getPublicFantasyLeaderboard);
  const joinFn = useServerFn(joinFantasyGame);
  const saveFn = useServerFn(saveFantasySquad);
  const saveGuestFn = useServerFn(saveGuestFantasySquad);
  const registerFn = useServerFn(fantasyGuestRegister);
  const signInFn = useServerFn(fantasyGuestSignInExisting);
  const requestResetFn = useServerFn(requestFantasyGuestPinReset);
  const resetPinFn = useServerFn(resetFantasyGuestPin);

  const stateQuery = useQuery<FantasyStateDTO>({
    queryKey: ["fantasy-state", user?.id ?? null, guest?.guestId ?? null],
    queryFn: () =>
      user
        ? stateFn({})
        : publicStateFn({ data: guest ? { email: guest.email, pin: guest.pin } : {} }),
    staleTime: 15_000,
  });
  const lbQuery = useQuery<FantasyLeaderboardRow[]>({
    queryKey: ["fantasy-leaderboard", user?.id ?? null],
    queryFn: () => (user ? lbFn({}) : publicLbFn({})),
    staleTime: 30_000,
  });

  const state = stateQuery.data;
  const joined = !!state?.joined;
  const canPlay = joined && (!!user || !!guest);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fantasy-state"] });
    qc.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
  };

  async function handleJoin() {
    setJoining(true);
    try {
      await joinFn({ data: {} });
      toast.success("You're in — build your squad!");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not join");
    } finally {
      setJoining(false);
    }
  }

  function persistGuest(s: GuestSession) {
    localStorage.setItem(GUEST_KEY, JSON.stringify(s));
    setGuest(s);
    setShowGuestLogin(false);
    refresh();
  }

  function handleGuestSignOut() {
    localStorage.removeItem(GUEST_KEY);
    setGuest(null);
    refresh();
  }

  const podium = useMemo(() => {
    const rows = lbQuery.data ?? [];
    const allFinal = (state?.gameweeks ?? []).length > 0 && (state?.gameweeks ?? []).every((g) => g.status === "final");
    if (!allFinal) return [];
    return rows.slice(0, 3).map((r, i) => ({
      place: (i + 1) as 1 | 2 | 3,
      userId: r.entrantId,
      isGuest: r.isGuest,
      name: r.teamName || r.displayName || r.username || "Anonymous",
      note: `${r.totalPoints} pt${r.totalPoints === 1 ? "" : "s"}`,
    }));
  }, [lbQuery.data, state?.gameweeks]);

  return (
    <div className={user ? "relative isolate min-h-dvh md:h-dvh md:overflow-hidden flex bg-transparent" : "relative isolate min-h-screen bg-transparent"}>
      <img src={riversideBg} alt="" aria-hidden className="pointer-events-none fixed inset-0 z-0 h-screen w-screen object-cover object-center" />
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "rgba(2, 6, 14, 0.78)" }} aria-hidden />
      {user && <IconRail />}
      <main className="relative z-10 flex-1 overflow-y-auto min-w-0">
        {!user && (
          <div className="relative z-10 border-b border-white/10 bg-background/30 backdrop-blur-sm">
            <LandingHeader />
          </div>
        )}
        <div className="w-full px-4 sm:px-8 lg:px-16 py-6">
          <header className="rounded-3xl border border-primary/30 shadow-glow bg-gradient-primary p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="size-12 rounded-2xl bg-white/15 grid place-items-center ring-1 ring-white/20">
                <Shirt className="size-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">MFC Fantasy Manager</h1>
                <p className="text-sm text-white/85">
                  Middlesbrough only. {money(state?.budgetM ?? 30)} budget, {FANTASY_SQUAD_SIZE}-man squad, your formation, your captain.
                </p>
              </div>
              {!user && !guest && !showGuestLogin && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={() => setShowGuestLogin(true)} className="bg-white text-primary hover:bg-white/90">Guest sign in</Button>
                </div>
              )}
            </div>
          </header>

          {user && !joined && (
            <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 text-sm">
                <div className="font-medium">Join the MFC Fantasy Manager</div>
                <div className="text-muted-foreground">Opt in to pick a squad and appear on the leaderboard.</div>
              </div>
              <Button onClick={handleJoin} disabled={joining}>
                {joining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
              </Button>
            </div>
          )}

          {!user && showGuestLogin && (
            <GuestAccessCard
              onSignIn={async (email, pin) => {
                const res = await signInFn({ data: { email, pin } });
                persistGuest({ guestId: res.guestId, email, pin, displayName: res.displayName, teamName: res.teamName ?? undefined });
                toast.success("Signed in — good luck!");
              }}
              onRegister={async (email, pin, displayName, teamName) => {
                const res = await registerFn({ data: { email, pin, displayName, teamName } });
                persistGuest({ guestId: res.guestId, email, pin, displayName: res.displayName, teamName: res.teamName });
                toast.success("Registered — build your squad!");
              }}
              onRequestReset={async (email) => {
                await requestResetFn({ data: { email } });
                toast.success("If that email is registered, a reset code is on its way.");
              }}
              onResetPin={async (email, code, newPin) => {
                const res = await resetPinFn({ data: { email, code, newPin } });
                persistGuest({ guestId: res.guestId, email, pin: newPin, displayName: guest?.displayName ?? "Guest" });
                toast.success("PIN reset — you're signed in.");
              }}
              onCancel={() => setShowGuestLogin(false)}
            />
          )}

          {!user && guest && (
            <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1">
                <div className="font-medium">Signed in as guest: <span className="font-bold">{guest.displayName}</span></div>
                <div className="text-muted-foreground text-xs">{guest.email}</div>
              </div>
              <Button size="sm" variant="outline" onClick={handleGuestSignOut}>
                <LogOut className="size-3.5 mr-1" /> Sign out
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full sm:w-auto h-auto gap-1 p-1">
                <TabsTrigger value="squad">My squad</TabsTrigger>
                <TabsTrigger value="gameweeks">Gameweeks</TabsTrigger>
                <TabsTrigger value="transfers">Transfers</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                <TabsTrigger value="scoring">Scoring</TabsTrigger>
                <TabsTrigger value="winners">Winners</TabsTrigger>
              </TabsList>

              <TabsContent value="squad" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : (
                  <SquadBuilder
                    state={state}
                    canPlay={canPlay}
                    onSave={async (payload) => {
                      if (user) await saveFn({ data: payload });
                      else if (guest) await saveGuestFn({ data: { email: guest.email, pin: guest.pin, ...payload } });
                      else throw new Error("Sign in first.");
                      refresh();
                    }}
                  />
                )}
              </TabsContent>

              <TabsContent value="gameweeks" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : <GameweekList state={state} />}
              </TabsContent>

              <TabsContent value="transfers" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : <TransfersTab state={state} />}
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-4">
                {lbQuery.isLoading ? <Loading /> : <LeaderboardTable rows={lbQuery.data ?? []} />}
              </TabsContent>

              <TabsContent value="scoring" className="mt-4">
                <ScoringTab />
              </TabsContent>

              <TabsContent value="winners" className="mt-4">
                <WinnersTab
                  title="MFC Fantasy Manager Winners"
                  subtitle="The top 3 managers appear here once every gameweek has been finalised."
                  winners={podium}
                  viewerUserId={user?.id ?? null}
                />
              </TabsContent>
            </Tabs>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <ManagerCard state={state} name={guest?.displayName ?? null} />
              <NextGameweekCard state={state} />
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------------
function ManagerCard({ state, name }: { state?: FantasyStateDTO; name: string | null }) {
  const total = (state?.squads ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Your team</div>
      <div className="font-display text-lg font-bold">{state?.teamName || name || "Unnamed FC"}</div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">Total points</dt>
          <dd className="font-bold text-primary">{total}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">Free transfers</dt>
          <dd className="font-bold">{state?.freeTransfers ?? 1}</dd>
        </div>
      </dl>
    </div>
  );
}

function NextGameweekCard({ state }: { state?: FantasyStateDTO }) {
  const gw = (state?.gameweeks ?? []).find((g) => g.id === state?.currentGameweekId);
  if (!gw) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Next gameweek</div>
      <div className="font-semibold">GW{gw.gwNumber} — {gw.homeTeam} v {gw.awayTeam}</div>
      <div className="text-xs text-muted-foreground mt-1">{kickoffLabel(gw.kickoffAt)}</div>
      <div className="mt-2 inline-flex items-center gap-1 text-xs rounded-full bg-amber-500/15 text-amber-400 px-2 py-1">
        <Lock className="size-3" /> Locks {kickoffLabel(gw.lockAt)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Squad builder
// ------------------------------------------------------------------
type SavePayload = {
  gameweekId: string;
  formation: string;
  starters: string[];
  bench: string[];
  captainId: string;
  viceId: string;
};

function SquadBuilder({
  state, canPlay, onSave,
}: {
  state: FantasyStateDTO;
  canPlay: boolean;
  onSave: (p: SavePayload) => Promise<void>;
}) {
  const gw = state.gameweeks.find((g) => g.id === state.currentGameweekId) ?? null;
  const existing = gw ? state.squads.find((s) => s.gameweekId === gw.id) : undefined;
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);

  const [formation, setFormation] = useState<FormationKey>((existing?.formation as FormationKey) ?? "4-4-2");
  const [selected, setSelected] = useState<string[]>(existing ? existing.picks.map((p) => p.playerId) : []);
  const [starters, setStarters] = useState<string[]>(existing ? existing.picks.filter((p) => p.isStarter).map((p) => p.playerId) : []);
  const [captainId, setCaptainId] = useState<string>(existing?.captainId ?? "");
  const [viceId, setViceId] = useState<string>(existing?.viceId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setFormation(existing.formation as FormationKey);
    setSelected(existing.picks.map((p) => p.playerId));
    setStarters(existing.picks.filter((p) => p.isStarter).map((p) => p.playerId));
    setCaptainId(existing.captainId ?? "");
    setViceId(existing.viceId ?? "");
  }, [existing?.id]);

  const spend = selected.reduce((sum, id) => sum + (playerById.get(id)?.valueM ?? 0), 0);
  const remaining = state.budgetM - spend;
  const counts = formationCounts(formation);
  const byPos = (ids: string[], pos: FantasyPosition) => ids.filter((id) => playerById.get(id)?.position === pos);
  const bench = selected.filter((id) => !starters.includes(id));
  const locked = !gw || gw.status !== "upcoming" || new Date(gw.lockAt).getTime() <= Date.now();

  const problems: string[] = [];
  if (selected.length !== FANTASY_SQUAD_SIZE) problems.push(`Pick exactly ${FANTASY_SQUAD_SIZE} players (${selected.length} selected).`);
  for (const pos of POSITION_ORDER) {
    const n = byPos(selected, pos).length;
    if (n !== SQUAD_QUOTA[pos]) problems.push(`${POSITION_SHORT[pos]}: need ${SQUAD_QUOTA[pos]}, have ${n}.`);
  }
  if (remaining < 0) problems.push(`Over budget by ${money(-remaining)}.`);
  if (starters.length !== 11) problems.push(`Pick 11 starters (${starters.length} selected).`);
  else {
    for (const pos of POSITION_ORDER) {
      const n = byPos(starters, pos).length;
      if (n !== (counts as any)[pos]) problems.push(`${formation}: needs ${(counts as any)[pos]} ${POSITION_SHORT[pos]} in the XI, you have ${n}.`);
    }
  }
  if (bench.length !== FANTASY_BENCH_SIZE) problems.push(`Bench must be ${FANTASY_BENCH_SIZE} players.`);
  if (!captainId || !starters.includes(captainId)) problems.push("Pick a captain from your starting XI.");
  if (!viceId || !starters.includes(viceId)) problems.push("Pick a vice-captain from your starting XI.");
  if (captainId && captainId === viceId) problems.push("Captain and vice-captain must be different.");

  function toggleSelect(p: FantasyPlayerDTO) {
    setSelected((prev) => {
      if (prev.includes(p.id)) {
        setStarters((s) => s.filter((x) => x !== p.id));
        if (captainId === p.id) setCaptainId("");
        if (viceId === p.id) setViceId("");
        return prev.filter((x) => x !== p.id);
      }
      if (prev.length >= FANTASY_SQUAD_SIZE) {
        toast.error(`Squad is full — ${FANTASY_SQUAD_SIZE} players max.`);
        return prev;
      }
      if (byPos(prev, p.position).length >= SQUAD_QUOTA[p.position]) {
        toast.error(`You already have ${SQUAD_QUOTA[p.position]} ${POSITION_SHORT[p.position]}s.`);
        return prev;
      }
      return [...prev, p.id];
    });
  }

  function toggleStarter(id: string) {
    setStarters((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 11) {
        toast.error("Starting XI is full — drop someone first.");
        return prev;
      }
      return [...prev, id];
    });
  }

  async function handleSave() {
    if (!gw) return;
    setSaving(true);
    try {
      await onSave({ gameweekId: gw.id, formation, starters, bench, captainId, viceId });
      toast.success("Squad saved.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save squad");
    } finally {
      setSaving(false);
    }
  }

  if (!gw) {
    return <div className="rounded-2xl border border-border/60 bg-card/80 p-6 text-sm text-muted-foreground">No gameweeks have been set up yet — check back soon.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold">GW{gw.gwNumber} — {gw.homeTeam} v {gw.awayTeam}</div>
          <div className="text-xs text-muted-foreground">{kickoffLabel(gw.kickoffAt)} · locks {kickoffLabel(gw.lockAt)}</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="size-4 text-primary" />
          <span className={remaining < 0 ? "text-destructive font-bold" : "font-bold"}>{money(remaining)}</span>
          <span className="text-muted-foreground">left of {money(state.budgetM)}</span>
        </div>
        <label className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">Formation</span>
          <select
            className="h-9 rounded-lg border-2 border-primary/50 bg-background px-2 text-sm"
            value={formation}
            onChange={(e) => setFormation(e.target.value as FormationKey)}
            disabled={locked || !canPlay}
          >
            {FORMATION_KEYS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <Button onClick={handleSave} disabled={saving || locked || !canPlay || problems.length > 0}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Save squad"}
        </Button>
      </div>

      {!canPlay && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Join the game (or sign in as a guest) to save a squad — you can browse the player pool meanwhile.
        </div>
      )}
      {locked && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
          <Lock className="size-4" /> This gameweek is locked. Changes will apply to the next one.
        </div>
      )}
      {canPlay && !locked && problems.length > 0 && (
        <ul className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm space-y-1">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {POSITION_ORDER.map((pos) => (
          <div key={pos} className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{POSITION_SHORT[pos]}</h3>
              <span className="text-xs text-muted-foreground">
                {byPos(selected, pos).length}/{SQUAD_QUOTA[pos]} picked · {byPos(starters, pos).length}/{(counts as any)[pos]} starting
              </span>
            </div>
            <ul className="space-y-1">
              {state.players.filter((p) => p.position === pos).map((p) => {
                const isSel = selected.includes(p.id);
                const isStart = starters.includes(p.id);
                return (
                  <li key={p.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${isSel ? "bg-primary/10 border border-primary/40" : "border border-transparent hover:bg-muted/40"}`}>
                    <button
                      type="button"
                      className="flex-1 text-left disabled:opacity-60"
                      onClick={() => toggleSelect(p)}
                      disabled={locked || !canPlay || p.status === "departed"}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.shirtNumber ? <span className="text-muted-foreground text-xs"> #{p.shirtNumber}</span> : null}
                      {p.status !== "active" && (
                        <span className="ml-2 text-[10px] uppercase rounded-full bg-destructive/20 text-destructive px-1.5 py-0.5">{p.status}</span>
                      )}
                    </button>
                    <span className="text-xs tabular-nums text-muted-foreground">{money(p.valueM)}</span>
                    {isSel && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleStarter(p.id)}
                          disabled={locked || !canPlay}
                          className={`text-[10px] rounded-full px-2 py-0.5 border ${isStart ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground"}`}
                        >
                          {isStart ? "XI" : "Bench"}
                        </button>
                        <button
                          type="button"
                          title="Captain"
                          onClick={() => setCaptainId(p.id)}
                          disabled={locked || !canPlay || !isStart}
                          className={`rounded-full p-1 ${captainId === p.id ? "text-amber-400" : "text-muted-foreground/50"}`}
                        >
                          <Crown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Vice-captain"
                          onClick={() => setViceId(p.id)}
                          disabled={locked || !canPlay || !isStart}
                          className={`rounded-full p-1 ${viceId === p.id ? "text-sky-400" : "text-muted-foreground/50"}`}
                        >
                          <Star className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Gameweeks
// ------------------------------------------------------------------
function GameweekList({ state }: { state: FantasyStateDTO }) {
  if (!state.gameweeks.length) {
    return <div className="rounded-2xl border border-border/60 bg-card/80 p-6 text-sm text-muted-foreground">No gameweeks yet.</div>;
  }
  return (
    <div className="space-y-2">
      {state.gameweeks.map((g) => {
        const squad = state.squads.find((s) => s.gameweekId === g.id);
        return (
          <div key={g.id} className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 flex flex-wrap items-center gap-3">
            <div className="w-14 text-xs font-bold text-primary">GW{g.gwNumber}</div>
            <div className="flex-1 min-w-[180px]">
              <div className="font-medium">{g.homeTeam} v {g.awayTeam}</div>
              <div className="text-xs text-muted-foreground">{kickoffLabel(g.kickoffAt)} · {g.competition}</div>
            </div>
            {g.homeScore !== null && g.awayScore !== null && (
              <div className="font-bold tabular-nums">{g.homeScore}–{g.awayScore}</div>
            )}
            <span className="text-[10px] uppercase rounded-full px-2 py-0.5 border border-border text-muted-foreground">{g.status}</span>
            {squad && (
              <span className="text-sm">
                <span className="text-muted-foreground">Your points </span>
                <span className="font-bold text-primary">{squad.points ?? "—"}</span>
                {squad.transferCost > 0 && <span className="text-destructive text-xs"> (−{squad.transferCost})</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// Transfers
// ------------------------------------------------------------------
function TransfersTab({ state }: { state: FantasyStateDTO }) {
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p.name])), [state.players]);
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><ArrowRightLeft className="size-4 text-primary" /> Middlesbrough transfer news</h3>
        {state.clubTransfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incoming or outgoing transfers logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {state.clubTransfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm rounded-xl bg-muted/30 px-3 py-2">
                <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${t.direction === "in" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {t.direction === "in" ? "IN" : "OUT"}
                </span>
                <span className="font-medium">{t.playerName}</span>
                {t.otherClub && <span className="text-muted-foreground">{t.direction === "in" ? "from" : "to"} {t.otherClub}</span>}
                {t.fee && <span className="text-muted-foreground">· {t.fee}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(t.transferDate).toLocaleDateString()} {t.windowLabel ? `· ${t.windowLabel}` : ""}
                </span>
                {t.note && <div className="w-full text-xs text-muted-foreground">{t.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
        <h3 className="font-semibold mb-3">Your transfers</h3>
        <p className="text-sm text-muted-foreground mb-3">
          You get 1 free transfer each gameweek (bank up to 2). Extra transfers cost 4 points each.
          Replacing a player who has left the club is always free.
        </p>
        {state.myTransfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers made yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {state.myTransfers.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2">
                <span className="text-red-400">{t.outPlayerId ? playerById.get(t.outPlayerId) ?? "—" : "—"}</span>
                <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                <span className="text-emerald-400">{t.inPlayerId ? playerById.get(t.inPlayerId) ?? "—" : "—"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.forced ? "free (departed)" : t.cost > 0 ? `−${t.cost} pts` : "free"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// Leaderboard + scoring
// ------------------------------------------------------------------
function LeaderboardTable({ rows }: { rows: FantasyLeaderboardRow[] }) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-border/60 bg-card/80 p-6 text-sm text-muted-foreground">No managers have scored yet.</div>;
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 w-10">#</th>
            <th className="text-left px-3 py-2">Manager</th>
            <th className="text-right px-3 py-2">GWs</th>
            <th className="text-right px-3 py-2">Hits</th>
            <th className="text-right px-3 py-2">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entrantId} className="border-t border-border/50">
              <td className="px-3 py-2 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.teamName || "Unnamed FC"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.displayName || r.username || "Guest"}{r.isGuest ? " · guest" : ""}
                </div>
                {r.email && <div className="text-[11px] text-muted-foreground">{r.email}</div>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.gameweeksScored}</td>
              <td className="px-3 py-2 text-right tabular-nums text-destructive">{r.totalHits ? `−${r.totalHits}` : "0"}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">{r.totalPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoringTab() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold flex items-center gap-2"><Trophy className="size-4 text-primary" /> How scoring works</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Only Middlesbrough players score. Your starting XI counts; bench players are subbed in automatically
          (in bench order) when a starter plays zero minutes. If your captain doesn't play, the vice-captain doubles instead.
        </p>
      </div>
      <ul className="divide-y divide-border/50">
        {SCORING_RULES.map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2 text-sm">
            <span>{r.label}</span>
            <span className="font-bold tabular-nums text-primary">{r.points}</span>
          </li>
        ))}
      </ul>
      <div className="text-sm text-muted-foreground">
        Squad rules: {FANTASY_SQUAD_SIZE} players ({SQUAD_QUOTA.gk} GK, {SQUAD_QUOTA.def} DEF, {SQUAD_QUOTA.mid} MID, {SQUAD_QUOTA.fwd} FWD),
        a £30.0m budget and any of these formations: {FORMATION_KEYS.join(", ")}. Squads lock 60 minutes before kick-off.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Guest access
// ------------------------------------------------------------------
function GuestAccessCard({
  onSignIn, onRegister, onRequestReset, onResetPin, onCancel,
}: {
  onSignIn: (email: string, pin: string) => Promise<void>;
  onRegister: (email: string, pin: string, displayName: string, teamName: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  onResetPin: (email: string, code: string, newPin: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "register" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast.error(e?.message ?? "Something went wrong"); } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 rounded-2xl border-2 border-primary/50 bg-card/90 backdrop-blur-md p-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["signin", "register", "reset"] as const).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {m === "signin" ? "Sign in" : m === "register" ? "Register" : "Forgot PIN"}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>Close</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input className="border-2 border-primary/50" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "reset" && (
          <Input className="border-2 border-primary/50" placeholder="4-digit PIN" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} />
        )}
        {mode === "register" && (
          <>
            <Input className="border-2 border-primary/50" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Input className="border-2 border-primary/50" placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </>
        )}
        {mode === "reset" && (
          <>
            <Input className="border-2 border-primary/50" placeholder="6-digit reset code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <Input className="border-2 border-primary/50" placeholder="New 4-digit PIN" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {mode === "signin" && (
          <Button disabled={busy} onClick={() => run(() => onSignIn(email, pin))}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        )}
        {mode === "register" && (
          <Button disabled={busy} onClick={() => run(() => onRegister(email, pin, displayName, teamName))}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create guest account"}
          </Button>
        )}
        {mode === "reset" && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => run(() => onRequestReset(email))}>Email me a code</Button>
            <Button disabled={busy} onClick={() => run(() => onResetPin(email, code, pin))}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Reset PIN"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

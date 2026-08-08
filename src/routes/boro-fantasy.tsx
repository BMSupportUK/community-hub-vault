import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shirt, Loader2, Lock, LogOut, Crown, Star, ArrowRightLeft, Trophy, Wallet,
  Users, Plus, Minus, X, ArrowUp, ArrowDown, ClipboardList,
} from "lucide-react";
import type { DragEvent as ReactDragEvent } from "react";
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
  POSITION_SHORT, POSITION_LABEL, SCORING_RULES, SQUAD_QUOTA, SQUAD_RULES,
  FORMATIONS, FANTASY_BUDGET_M, FANTASY_LOCK_MINUTES, formationCounts, formationRows,
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
const BENCH_SLOT_LABELS = ["GK", "Def", "Mid", "Fwd"] as const;

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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Keep the first-team squad live: ask the server to re-check the official
  // club squad whenever the page is opened or refocused (throttled server-side).
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetch("/api/public/hooks/fantasy-squad-sync", { method: "POST" });
        const json = (await res.json()) as { skipped?: string; added?: string[]; departed?: string[] };
        if (cancelled || json.skipped) return;
        if ((json.added?.length ?? 0) + (json.departed?.length ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["fantasy-state"] });
        }
      } catch { /* ignore */ }
    };
    ping();
    const onFocus = () => { void ping(); };
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(ping, 120_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
      };
  }, [qc]);
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
              <TabsList className="grid grid-cols-3 sm:grid-cols-7 w-full sm:w-auto h-auto gap-1 p-1">
                <TabsTrigger value="squad">My squad</TabsTrigger>
                <TabsTrigger value="rules">Squad rules</TabsTrigger>
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

              <TabsContent value="rules" className="mt-4">
                <SquadRulesTab />
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
  const [squadTab, setSquadTab] = useState<"selector" | "xi">("selector");

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
  const locked = !!gw && (gw.status !== "upcoming" || new Date(gw.lockAt).getTime() <= Date.now());

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

  const editable = !locked && (canPlay || !gw);

  /** Ensure the player is in the 15 — returns the new squad list, or null if not possible. */
  function withPlayer(sel: string[], p: FantasyPlayerDTO): string[] | null {
    if (sel.includes(p.id)) return sel;
    if (p.status === "departed") { toast.error(`${p.name} has left the club.`); return null; }
    if (sel.length >= FANTASY_SQUAD_SIZE) { toast.error(`Squad is full — ${FANTASY_SQUAD_SIZE} players max.`); return null; }
    if (byPos(sel, p.position).length >= SQUAD_QUOTA[p.position]) {
      toast.error(`You already have ${SQUAD_QUOTA[p.position]} ${POSITION_SHORT[p.position]}s.`);
      return null;
    }
    return [...sel, p.id];
  }

  function removePlayer(id: string) {
    if (!editable) return;
    setSelected((prev) => prev.filter((x) => x !== id));
    setStarters((prev) => prev.filter((x) => x !== id));
    if (captainId === id) setCaptainId("");
    if (viceId === id) setViceId("");
  }

  function benchPlayer(id: string) {
    if (!editable) return;
    setStarters((prev) => prev.filter((x) => x !== id));
    if (captainId === id) setCaptainId("");
    if (viceId === id) setViceId("");
  }

  /** Put a player into the XI, optionally swapping out whoever holds that slot. */
  function startPlayer(p: FantasyPlayerDTO, replaceId?: string) {
    if (!editable) return;
    const sel = withPlayer(selected, p);
    if (!sel) return;
    let st = starters.filter((x) => x !== replaceId);
    if (!st.includes(p.id)) {
      const line = byPos(st, p.position);
      const need = (counts as Record<string, number>)[p.position] ?? 0;
      if (line.length >= need) {
        const bumped = line[line.length - 1]!;
        st = st.filter((x) => x !== bumped);
        if (captainId === bumped) setCaptainId("");
        if (viceId === bumped) setViceId("");
      }
      st = [...st, p.id];
    }
    if (replaceId) {
      if (captainId === replaceId) setCaptainId("");
      if (viceId === replaceId) setViceId("");
    }
    setSelected(sel);
    setStarters(st);
  }

  /** Add a player to the bench (or squad only). */
  function benchAdd(p: FantasyPlayerDTO) {
    if (!editable) return;
    const sel = withPlayer(selected, p);
    if (!sel) return;
    setSelected(sel);
    setStarters((prev) => prev.filter((x) => x !== p.id));
  }

  /** Sidebar one-tap: fill an open XI slot if there is one, else the bench. */
  function autoPick(p: FantasyPlayerDTO) {
    if (!editable) return;
    if (selected.includes(p.id)) { removePlayer(p.id); return; }
    const need = (counts as Record<string, number>)[p.position] ?? 0;
    if (starters.length < 11 && byPos(starters, p.position).length < need) startPlayer(p);
    else benchAdd(p);
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          {gw ? (
            <>
              <div className="font-semibold">GW{gw.gwNumber} — {gw.homeTeam} v {gw.awayTeam}</div>
              <div className="text-xs text-muted-foreground">{kickoffLabel(gw.kickoffAt)} · locks {kickoffLabel(gw.lockAt)}</div>
            </>
          ) : (
            <>
              <div className="font-semibold">Pre-season — no gameweek open yet</div>
              <div className="text-xs text-muted-foreground">Try out formations and squads now; you can save once the first gameweek opens.</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="size-4 text-primary" />
          <span className={remaining < 0 ? "text-destructive font-bold" : "font-bold"}>{money(remaining)}</span>
          <span className="text-muted-foreground">left of {money(state.budgetM)}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{selected.length}</span>/{FANTASY_SQUAD_SIZE} picked ·{" "}
          <span className="font-bold text-foreground">{starters.length}</span>/11 starting
        </div>
        <Button onClick={handleSave} disabled={saving || locked || !gw || !canPlay || problems.length > 0}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Save squad"}
        </Button>
      </div>

      {gw && !canPlay && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Join the game (or sign in as a guest) to save a squad — you can browse the player pool meanwhile.
        </div>
      )}
      {locked && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
          <Lock className="size-4" /> This gameweek is locked. Changes will apply to the next one.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
        <Tabs value={squadTab} onValueChange={(v) => setSquadTab(v as "selector" | "xi")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="selector">Squad selector</TabsTrigger>
            <TabsTrigger value="xi">Starting 11</TabsTrigger>
          </TabsList>

          <TabsContent value="selector" className="mt-0">
            <div className="space-y-4">
              <SquadPitch
                playerById={playerById}
                selected={selected}
                starters={starters}
                editable={editable}
                onAdd={(playerId) => {
                  const p = playerById.get(playerId);
                  if (p && !selected.includes(p.id)) autoPick(p);
                }}
                onRemove={removePlayer}
              />
              <PlayerSidebar
              players={state.players}
              selected={selected}
              starters={starters}
              counts={counts as Record<string, number>}
              editable={editable}
              onPick={autoPick}
              />
            </div>
          </TabsContent>

          <TabsContent value="xi" className="mt-0">
            <PitchView
              formation={formation}
              onFormationChange={(f) => setFormation(f)}
              editable={editable}
              playerById={playerById}
              starters={starters}
              bench={bench}
              captainId={captainId}
              viceId={viceId}
              onDropStart={(playerId, replaceId) => {
                const p = playerById.get(playerId);
                if (p) startPlayer(p, replaceId);
              }}
              onDropBench={(playerId) => {
                const p = playerById.get(playerId);
                if (p) benchAdd(p);
              }}
              onBench={benchPlayer}
              onRemove={removePlayer}
              onCaptain={(id) => setCaptainId(id)}
              onVice={(id) => setViceId(id)}
            />
          </TabsContent>
        </Tabs>

        {/* Squad checklist — stays visible while switching between squad and XI tabs. */}
        <aside className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden lg:sticky lg:top-4">
          <div className="p-3 border-b border-border/60 flex items-center gap-2">
            <h3 className="font-display font-bold text-sm">Squad checklist</h3>
            {canPlay && !locked && (
              <span
                className={
                  "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold border " +
                  (problems.length === 0
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-destructive/40 bg-destructive/15 text-destructive")
                }
              >
                {problems.length === 0 ? "Ready" : `${problems.length} to fix`}
              </span>
            )}
          </div>
          <div className="p-3 text-sm">
            {!canPlay || locked ? (
              <p className="text-xs text-muted-foreground">
                {locked
                  ? "This gameweek is locked — the checklist reopens for the next one."
                  : "Join the game to start building a valid squad."}
              </p>
            ) : problems.length === 0 ? (
              <p className="text-xs text-emerald-300">
                Squad is valid — hit <span className="font-semibold">Save squad</span>.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {problems.map((p) => (
                  <li key={p} className="flex gap-2 text-xs leading-relaxed">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Player sidebar
// ------------------------------------------------------------------
const POS_TINT: Record<FantasyPosition, string> = {
  gk: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  def: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  mid: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  fwd: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

function PlayerSidebar({
  players, selected, starters, counts, editable, onPick,
}: {
  players: FantasyPlayerDTO[];
  selected: string[];
  starters: string[];
  counts: Record<string, number>;
  editable: boolean;
  onPick: (p: FantasyPlayerDTO) => void;
}) {
  const [filter, setFilter] = useState<"all" | FantasyPosition>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"value" | "name">("value");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return players
      .filter((p) => (filter === "all" ? true : p.position === filter))
      .filter((p) => (term ? p.name.toLowerCase().includes(term) : true))
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.valueM - a.valueM,
      );
  }, [players, filter, q, sort]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden lg:sticky lg:top-4">
      <div className="p-3 border-b border-border/60 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold flex items-center gap-2"><Users className="size-4 text-primary" /> Player list</h3>
          <button
            type="button"
            onClick={() => setSort(sort === "value" ? "name" : "value")}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Sort: {sort === "value" ? "value" : "A–Z"}
          </button>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…" className="h-8 border-2 border-primary/40" />
        <div className="flex flex-wrap gap-1">
          {(["all", ...POSITION_ORDER] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-[11px] rounded-full px-2.5 py-1 border transition-colors ${
                filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border/70 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {f === "all" ? "All" : POSITION_SHORT[f]}
              {f !== "all" && (
                <span className="ml-1 opacity-70">
                  {selected.filter((id) => players.find((p) => p.id === id)?.position === f).length}/{SQUAD_QUOTA[f]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-[560px] overflow-y-auto divide-y divide-border/40">
        {list.map((p) => {
          const isSel = selected.includes(p.id);
          const isStart = starters.includes(p.id);
          const full = !isSel && (counts[p.position] ?? 0) >= 0 && selected.filter((id) => players.find((x) => x.id === id)?.position === p.position).length >= SQUAD_QUOTA[p.position];
          return (
            <li
              key={p.id}
              draggable={editable && p.status !== "departed"}
              onDragStart={(e) => { e.dataTransfer.setData("text/fantasy-player", p.id); e.dataTransfer.effectAllowed = "move"; }}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${editable ? "cursor-grab active:cursor-grabbing" : ""} ${
                isSel ? "bg-primary/10" : full ? "opacity-50" : "hover:bg-muted/40"
              }`}
            >
              <span className={`text-[10px] font-bold rounded-md border px-1.5 py-0.5 ${POS_TINT[p.position]}`}>{POSITION_SHORT[p.position]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {money(p.valueM)}
                  {isSel && <span className="ml-1 text-primary">· {isStart ? "XI" : "bench"}</span>}
                  {p.status !== "active" && <span className="ml-1 text-destructive uppercase">{p.status}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPick(p)}
                disabled={!editable || p.status === "departed"}
                title={isSel ? "Remove from squad" : "Add to squad"}
                className={`shrink-0 grid place-items-center size-7 rounded-lg border transition-colors disabled:opacity-40 ${
                  isSel ? "border-destructive/50 text-destructive hover:bg-destructive/10" : "border-primary/50 text-primary hover:bg-primary/10"
                }`}
              >
                {isSel ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No players match.</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------
// Pitch
// ------------------------------------------------------------------
function PitchView({
  formation, onFormationChange, editable, playerById, starters, bench, captainId, viceId,
  onDropStart, onDropBench, onBench, onRemove, onCaptain, onVice,
}: {
  formation: FormationKey;
  onFormationChange: (f: FormationKey) => void;
  editable: boolean;
  playerById: Map<string, FantasyPlayerDTO>;
  starters: string[];
  bench: string[];
  captainId: string;
  viceId: string;
  onDropStart: (playerId: string, replaceId?: string) => void;
  onDropBench: (playerId: string) => void;
  onBench: (id: string) => void;
  onRemove: (id: string) => void;
  onCaptain: (id: string) => void;
  onVice: (id: string) => void;
}) {
  const rows = formationRows(formation);
  const meta = FORMATIONS[formation];

  // Distribute the starters of each position across the rows that ask for them.
  const queues: Record<string, string[]> = {};
  for (const pos of POSITION_ORDER) queues[pos] = starters.filter((id) => playerById.get(id)?.position === pos);
  const rowSlots = rows.map((r) => {
    const take: (string | null)[] = [];
    for (let i = 0; i < r.count; i++) take.push(queues[r.pos]!.shift() ?? null);
    return { pos: r.pos, slots: take };
  });

  const dropProps = (handler: (playerId: string) => void) => ({
    onDragOver: (e: ReactDragEvent) => { if (editable) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: ReactDragEvent) => {
      if (!editable) return;
      e.preventDefault();
      const id = e.dataTransfer.getData("text/fantasy-player");
      if (id) handler(id);
    },
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden">
      <div className="p-3 border-b border-border/60 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Formation</span>
          <select
            className="h-9 rounded-lg border-2 border-primary/50 bg-background px-2 text-sm font-semibold"
            value={formation}
            onChange={(e) => onFormationChange(e.target.value as FormationKey)}
            disabled={!editable}
          >
            {FORMATION_KEYS.map((f) => (
              <option key={f} value={f}>{f} — {FORMATIONS[f].label}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Drag players between the pitch and bench to set your XI and bench order.
        </p>
      </div>

      <div
        className="relative p-4 sm:p-6"
        style={{
          background:
            "repeating-linear-gradient(to bottom, oklch(0.34 0.09 152) 0 44px, oklch(0.31 0.09 152) 44px 88px)",
        }}
      >
        <div className="pointer-events-none absolute inset-4 sm:inset-6 rounded-xl border-2 border-white/25" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-4 sm:top-6 h-16 w-40 -translate-x-1/2 rounded-b-xl border-x-2 border-b-2 border-white/25" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 bottom-4 sm:bottom-6 h-16 w-40 -translate-x-1/2 rounded-t-xl border-x-2 border-t-2 border-white/25" aria-hidden />
        <div className="relative space-y-4 sm:space-y-6 py-2">
          {rowSlots.map((row, ri) => (
            <div key={ri} className="flex flex-nowrap justify-center gap-1 sm:gap-2">
              {row.slots.map((id, si) => {
                const p = id ? playerById.get(id) : undefined;
                return (
                  <div
                    key={`${ri}-${si}`}
                    {...dropProps((dragged) => onDropStart(dragged, id ?? undefined))}
                    draggable={editable && !!id}
                    onDragStart={(e) => { if (id) e.dataTransfer.setData("text/fantasy-player", id); }}
                    className={`w-[64px] sm:w-[86px] rounded-xl border px-1.5 py-2 text-center backdrop-blur-sm transition-colors ${
                      p ? "border-white/40 bg-slate-950/70" : "border-dashed border-white/40 bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    {p ? (
                      <>
                        <div className="flex items-center justify-center gap-1">
                          <Shirt className="size-4 text-white/80" />
                          {captainId === p.id && <Crown className="size-3.5 text-amber-400" />}
                          {viceId === p.id && <Star className="size-3.5 text-sky-300" />}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] tabular-nums text-white/70">{money(p.valueM)}</div>
                        {editable && (
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <button type="button" title="Captain" onClick={() => onCaptain(p.id)} className={`rounded p-0.5 ${captainId === p.id ? "text-amber-400" : "text-white/50 hover:text-white"}`}>
                              <Crown className="size-3" />
                            </button>
                            <button type="button" title="Vice-captain" onClick={() => onVice(p.id)} className={`rounded p-0.5 ${viceId === p.id ? "text-sky-300" : "text-white/50 hover:text-white"}`}>
                              <Star className="size-3" />
                            </button>
                            <button type="button" title="Move to bench" onClick={() => onBench(p.id)} className="rounded p-0.5 text-white/50 hover:text-white">
                              <ArrowDown className="size-3" />
                            </button>
                            <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-white/50 hover:text-destructive">
                              <X className="size-3" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-2 text-[11px] font-semibold text-white/80">
                        <div className="mx-auto mb-1 grid size-6 place-items-center rounded-full border border-white/50">
                          <Plus className="size-3" />
                        </div>
                        {POSITION_SHORT[row.pos]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-border/60" {...dropProps(onDropBench)}>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Bench ({bench.length}/{FANTASY_BENCH_SIZE}) — first to come on, top left</div>
        <div className="flex flex-wrap gap-2">
          {BENCH_SLOT_LABELS.map((slotLabel, i) => {
            const id = bench[i];
            const p = id ? playerById.get(id) : undefined;
            return (
              <div
                key={i}
                {...dropProps(onDropBench)}
                draggable={editable && !!id}
                onDragStart={(e) => { if (id) e.dataTransfer.setData("text/fantasy-player", id); }}
                className={`w-[64px] sm:w-[86px] rounded-xl border px-1.5 py-2 text-center text-xs ${
                  p ? "border-border/70 bg-muted/40" : "border-dashed border-border/70 bg-muted/20 text-muted-foreground"
                }`}
              >
                {p ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <span className={`text-[10px] font-bold rounded-md border px-1 ${POS_TINT[p.position]}`}>{POSITION_SHORT[p.position]}</span>
                    </div>
                    <div className="mt-1 truncate font-semibold">{p.name}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">{money(p.valueM)}</div>
                    {editable && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <button type="button" title="Into the XI" onClick={() => onDropStart(p.id)} className="rounded p-0.5 text-muted-foreground hover:text-emerald-400">
                          <ArrowUp className="size-3" />
                        </button>
                        <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                          <X className="size-3" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-3 font-semibold">{slotLabel}</div>
                )}
              </div>
            );
          })}
        </div>
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
  // The site owner (Dane J) plays for fun and always sits at the bottom,
  // outside the ranked positions.
  const isOwner = (r: FantasyLeaderboardRow) => {
    const aliases = new Set(["dane", "danej", "dane j"]);
    return (
      aliases.has((r.username ?? "").trim().toLowerCase()) ||
      aliases.has((r.displayName ?? "").trim().toLowerCase())
    );
  };
  const ranked = rows.filter((r) => !isOwner(r));
  const ownerRows = rows.filter(isOwner);
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
          {ranked.map((r, i) => (
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
          {ownerRows.map((r) => (
            <tr key={r.entrantId} className="border-t-2 border-primary/30 bg-muted/30">
              <td className="px-3 py-2 text-muted-foreground">—</td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.teamName || "Unnamed FC"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.displayName || r.username || "Guest"}{r.isGuest ? " · guest" : ""}
                </div>
                {r.email && <div className="text-[11px] text-muted-foreground">{r.email}</div>}
                <div className="text-[11px] font-medium text-primary mt-0.5">Site owner — playing for fun</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.gameweeksScored}</td>
              <td className="px-3 py-2 text-right tabular-nums text-destructive">{r.totalHits ? `−${r.totalHits}` : "0"}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">{r.totalPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ownerRows.length > 0 && (
        <p className="border-t border-border/50 bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
          Site owner plays for fun and is not ranked or eligible for prizes.
        </p>
      )}
    </div>
  );
}

function SquadRulesTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-primary/30 bg-gradient-primary p-5 shadow-glow">
        <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
          <ClipboardList className="size-5" /> Squad rules
        </h3>
        <p className="text-sm text-white/85 mt-1">Everything you need to know before you build your Middlesbrough side.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: "Budget", v: money(FANTASY_BUDGET_M) },
            { k: "Squad", v: `${FANTASY_SQUAD_SIZE} players` },
            { k: "Bench", v: `${FANTASY_BENCH_SIZE} subs` },
            { k: "Deadline", v: `${FANTASY_LOCK_MINUTES} min pre-KO` },
          ].map((s) => (
            <div key={s.k} className="rounded-xl bg-white/15 ring-1 ring-white/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-white/75">{s.k}</div>
              <div className="font-bold text-white">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SQUAD_RULES.map((r) => (
          <section key={r.title} className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur p-4">
            <h4 className="font-semibold text-primary">{r.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{r.body}</p>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur p-4">
        <h4 className="font-semibold mb-3">Squad quotas</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {POSITION_ORDER.map((pos) => (
            <div key={pos} className={`rounded-xl border px-3 py-2 ${POS_TINT[pos]}`}>
              <div className="text-[11px] uppercase tracking-wide opacity-80">{POSITION_LABEL[pos]}s</div>
              <div className="text-lg font-bold">{SQUAD_QUOTA[pos]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur p-4">
        <h4 className="font-semibold mb-3">Allowed formations</h4>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FORMATION_KEYS.map((f) => (
            <li key={f} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2 text-sm">
              <span className="font-bold tabular-nums text-primary w-16">{f}</span>
              <span className="text-muted-foreground">{FORMATIONS[f].label}</span>
            </li>
          ))}
        </ul>
      </section>
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
        Squad size, budget, formations and deadlines all live on the <span className="font-semibold text-foreground">Squad rules</span> tab.
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

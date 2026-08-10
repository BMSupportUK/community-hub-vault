import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shirt, Loader2, Lock, LogOut, Crown, Star, ArrowRightLeft, Trophy,
  Users, Plus, X, ArrowUp, ArrowDown, ClipboardList, Check, Pencil,
} from "lucide-react";
import type { DragEvent as ReactDragEvent } from "react";
import { toast } from "sonner";
import riversideBg from "@/assets/riverside-stadium-bg.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { WinnersTab } from "@/components/app/WinnersTab";
import { LandingHeader } from "@/components/LandingHeader";
import { IconRail } from "@/components/app/IconRail";
import { useAuth } from "@/hooks/use-auth";
import {
  benchRulesFor, COMPETITION_BENCH_RULES, FORMATION_KEYS, POSITION_ORDER,
  POSITION_SHORT, POSITION_LABEL, SCORING_RULES, SQUAD_RULES,
  FORMATIONS, formationCounts, formationRows,
  fantasyCompetitionGroup, FANTASY_GROUP_LABEL,
  type FantasyPosition, type FormationKey, type FantasyCompetitionGroup,
} from "@/lib/fantasy-rules";
import {
  getFantasyState, getFantasyLeaderboard, joinFantasyGame, saveFantasySquad, setFantasyTeamName,
  type FantasyStateDTO, type FantasyPlayerDTO, type FantasyLeaderboardRow,
} from "@/lib/fantasy.functions";
import {
  fantasyGuestRegister, fantasyGuestSignInExisting, getPublicFantasyState,
  getPublicFantasyLeaderboard, saveGuestFantasySquad, requestFantasyGuestPinReset,
  resetFantasyGuestPin, setGuestFantasyTeamName,
} from "@/lib/fantasy-guest.functions";

export const Route = createFileRoute("/boro-fantasy")({
  head: () => ({
    meta: [
      { title: "MFC Fantasy Manager — Middlesbrough Fantasy Football" },
      { name: "description", content: "Name a Middlesbrough match day 11 and a sub bench covering every position, pick your formation and captain, and climb the MFC Fantasy Manager leaderboard." },
      { property: "og:title", content: "MFC Fantasy Manager — Middlesbrough Fantasy Football" },
      { property: "og:description", content: "Middlesbrough-only fantasy football: real formations, a full sub bench, weekly scoring and prizes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BoroFantasyPage,
});

type GuestSession = { guestId: string; email: string; pin: string; displayName: string; teamName?: string };
const GUEST_KEY = "fantasy_guest_session";
const BENCH_SLOT_LABELS = ["Replacement GK", "Sub", "Sub", "Sub"] as const;

const kickoffLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [interval]);
  return now;
}

function DigitalLockCountdown({
  lockAt,
  label = "Locks in",
  compact,
}: { lockAt: string; label?: string; compact?: boolean }) {
  const now = useNow(1000);
  const lockMs = new Date(lockAt).getTime();
  const remaining = lockMs - now;
  const locked = remaining <= 0;
  const urgent = remaining > 0 && remaining <= 60 * 60 * 1000;

  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const unit = (value: number, suffix: string) => (
    <div className={`flex flex-col items-center ${compact ? "min-w-[2.4rem]" : "min-w-[3.2rem]"}`}>
      <div className={`relative rounded-lg border-2 font-digital font-black tabular-nums leading-none ${
        compact ? "px-1.5 py-1 text-base" : "px-2 py-1.5 sm:px-3 sm:py-2 text-xl sm:text-2xl"
      } ${
        urgent
          ? "bg-red-600/20 border-red-400 text-red-300 shadow-[0_0_18px_rgba(248,113,113,0.55)] animate-pulse"
          : "bg-amber-500/15 border-amber-400/70 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
      }`}>
        {value.toString().padStart(2, "0")}
      </div>
      <span className={`${compact ? "text-[9px]" : "text-[10px] sm:text-[11px]"} font-semibold uppercase tracking-wider text-white/70 mt-1`}>{suffix}</span>
    </div>
  );

  return (
    <div className="w-full">
      <div className={`flex items-center gap-2 font-digital font-bold uppercase tracking-widest ${compact ? "mb-1 text-[11px]" : "mb-2 text-sm"} ${urgent ? "text-red-300" : "text-amber-300"}`}>
        <Lock className={compact ? "size-3.5" : "size-4"} strokeWidth={3} />
        {locked ? "Locked" : label}
      </div>
      {locked ? (
        <div className={`inline-flex items-center gap-2 rounded-lg border-2 border-red-400 bg-red-600/20 font-digital font-black text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.55)] ${compact ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-lg"}`}>
          <Lock className={compact ? "size-4" : "size-5"} strokeWidth={3} /> SQUAD LOCKED
        </div>
      ) : (
        <div className={`flex items-start ${compact ? "gap-1.5" : "gap-2 sm:gap-3"}`}>
          {days > 0 && unit(days, "Days")}
          {unit(hours, "Hrs")}
          <span className={`font-digital text-white/40 ${compact ? "text-lg pt-1" : "text-2xl pt-2"}`}>:</span>
          {unit(minutes, "Min")}
          <span className={`font-digital text-white/40 ${compact ? "text-lg pt-1" : "text-2xl pt-2"}`}>:</span>
          {unit(seconds, "Sec")}
        </div>
      )}
    </div>
  );
}

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
  const setTeamNameFn = useServerFn(setFantasyTeamName);
  const setGuestTeamNameFn = useServerFn(setGuestFantasyTeamName);

  const stateQuery = useQuery<FantasyStateDTO>({
    queryKey: ["fantasy-state", user?.id ?? null, guest?.guestId ?? null],
    queryFn: () =>
      user
        ? stateFn({})
        : publicStateFn({ data: guest ? { email: guest.email, pin: guest.pin } : {} }),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
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
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const state = stateQuery.data;
  const joined = !!state?.joined;
  const canPlay = joined && (!!user || !!guest);
  const currentTeamName = (state?.teamName || guest?.teamName || "").trim();

  // Live match? Pull ESPN in-play stats and refresh the pitch view every 30s so
  // each player's minutes and points update while the game is being played.
  const liveMatch = useMemo(() => {
    const now = Date.now();
    return (state?.gameweeks ?? []).some((g) => {
      if (g.status === "final") return false;
      const ko = Date.parse(g.kickoffAt);
      return Number.isFinite(ko) && now >= ko && now <= ko + 3.5 * 3600_000;
    });
  }, [state?.gameweeks]);

  useEffect(() => {
    if (!liveMatch) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await fetch("/api/public/hooks/sync-fantasy-scores", { method: "POST" });
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ["fantasy-state"] });
          qc.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
        }
      } catch { /* ignore */ }
    };
    void tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveMatch, qc]);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const pendingSaveRef = useRef<{
    payload: any;
    resolve: () => void;
    reject: (e: unknown) => void;
  } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fantasy-state"] });
    qc.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
  };

  async function doSaveSquad(payload: any) {
    if (user) await saveFn({ data: payload });
    else if (guest) await saveGuestFn({ data: { email: guest.email, pin: guest.pin, ...payload } });
    else throw new Error("Sign in first.");
    refresh();
  }

  async function persistTeamName(teamName: string) {
    if (user) await setTeamNameFn({ data: { teamName } });
    else if (guest) {
      await setGuestTeamNameFn({ data: { email: guest.email, pin: guest.pin, teamName } });
      const next = { ...guest, teamName };
      localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      setGuest(next);
    } else throw new Error("Sign in first.");
  }

  function openNameDialog() {
    setNameDraft(currentTeamName);
    setNameDialogOpen(true);
  }

  function closeNameDialog() {
    setNameDialogOpen(false);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    pending?.reject(new Error("Enter a team name to save your squad."));
  }

  async function submitTeamName() {
    const teamName = nameDraft.trim();
    if (!teamName) { toast.error("Enter a team name"); return; }
    setSavingName(true);
    const pending = pendingSaveRef.current;
    try {
      await persistTeamName(teamName);
      if (pending) {
        await doSaveSquad(pending.payload);
        pendingSaveRef.current = null;
        pending.resolve();
      } else {
        toast.success("Team name updated");
        refresh();
      }
      setNameDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save team name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSquadSave(payload: any) {
    if (!currentTeamName) {
      setNameDraft("");
      setNameDialogOpen(true);
      await new Promise<void>((resolve, reject) => {
        pendingSaveRef.current = { payload, resolve, reject };
      });
      return;
    }
    await doSaveSquad(payload);
  }

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
                  Middlesbrough only — name your match day 11, your sub bench, your formation and your captain.
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
              <TabsList className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 w-full h-auto gap-1 p-1">
                <TabsTrigger value="squad">My squad</TabsTrigger>
                <TabsTrigger value="rules">Game rules</TabsTrigger>
                <TabsTrigger value="gameweeks">League games</TabsTrigger>
                <TabsTrigger value="cup">Cup games</TabsTrigger>
                <TabsTrigger value="playoff">Play-off games</TabsTrigger>
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
                    onSave={handleSquadSave}
                    name={guest?.displayName ?? null}
                    teamName={currentTeamName}
                    canEdit={canPlay}
                    onEdit={openNameDialog}
                  />
                )}
              </TabsContent>

              <TabsContent value="rules" className="mt-4">
                <SquadRulesTab />
              </TabsContent>

              <TabsContent value="gameweeks" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : <GameweekList state={state} group="league" />}
              </TabsContent>

              <TabsContent value="cup" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : <GameweekList state={state} group="cup" />}
              </TabsContent>

              <TabsContent value="playoff" className="mt-4">
                {stateQuery.isLoading || !state ? <Loading /> : <GameweekList state={state} group="playoff" />}
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
              <NextGameweekCard state={state} />
            </aside>
          </div>
        </div>
      </main>

      <Dialog open={nameDialogOpen} onOpenChange={(o) => { if (!o) closeNameDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{currentTeamName ? "Edit team name" : "Name your team"}</DialogTitle>
            <DialogDescription>
              This is the name shown on the MFC Fantasy Manager leaderboard.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            maxLength={40}
            className="border-2 border-primary/50"
            placeholder="e.g. Riverside Rovers"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submitTeamName(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeNameDialog} disabled={savingName}>Cancel</Button>
            <Button onClick={() => void submitTeamName()} disabled={savingName || !nameDraft.trim()}>
              {savingName ? <Loader2 className="size-4 animate-spin" /> : pendingSaveRef.current ? "Save name & squad" : "Save name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------------
function ManagerCard({
  state, name, teamName, canEdit, onEdit, compact,
}: {
  state?: FantasyStateDTO;
  name: string | null;
  teamName?: string;
  canEdit?: boolean;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const total = (state?.squads ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  if (compact) {
    return (
      <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-card/80 p-3 shadow-glow backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Trophy className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display text-base font-bold truncate">
                {teamName || state?.teamName || name || "Unnamed FC"}
              </span>
              {canEdit && onEdit && (
                <Button size="sm" variant="ghost" className="h-6 px-1.5 shrink-0" onClick={onEdit}>
                  <Pencil className="size-3" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-primary">{total} pts</span>
              <span className="text-muted-foreground">Changes unlimited</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Your team</div>
      <div className="flex items-center gap-2">
        <div className="font-display text-lg font-bold min-w-0 break-words">
          {teamName || state?.teamName || name || "Unnamed FC"}
        </div>
        {canEdit && onEdit && (
          <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={onEdit}>
            <Pencil className="size-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">Total points</dt>
          <dd className="font-bold text-primary">{total}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-2">
          <dt className="text-[11px] text-muted-foreground">Team changes</dt>
          <dd className="font-bold">Unlimited</dd>
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
      <div className="text-xs text-muted-foreground mt-1">{gw.dateTbc ? "Date to be confirmed" : kickoffLabel(gw.kickoffAt)}</div>
      <div className="mt-3">
        <DigitalLockCountdown lockAt={gw.lockAt} />
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
  state, canPlay, onSave, name, teamName, canEdit, onEdit,
}: {
  state: FantasyStateDTO;
  canPlay: boolean;
  onSave: (p: SavePayload) => Promise<void>;
  name: string | null;
  teamName: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  // Managers can work ahead: any gameweek that's still open (upcoming and not
  // past its lock time) can be picked from the dropdown.
  const openGameweeks = useMemo(
    () =>
      state.gameweeks
        .filter((g) => g.status === "upcoming" && new Date(g.lockAt).getTime() > Date.now())
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()),
    [state.gameweeks],
  );
  const openByGroup = useMemo(() => {
    const by = { league: [] as typeof openGameweeks, cup: [] as typeof openGameweeks, playoff: [] as typeof openGameweeks };
    for (const g of openGameweeks) {
      by[fantasyCompetitionGroup(g.competition)].push(g);
    }
    return by;
  }, [openGameweeks]);
  const [gwId, setGwId] = useState<string>(state.currentGameweekId ?? "");
  useEffect(() => {
    const valid = state.gameweeks.some((g) => g.id === gwId);
    if (!valid) setGwId(state.currentGameweekId ?? openGameweeks[0]?.id ?? "");
  }, [state.currentGameweekId, state.gameweeks, openGameweeks, gwId]);
  const gw = state.gameweeks.find((g) => g.id === gwId) ?? null;
  const existing = gw ? state.squads.find((s) => s.gameweekId === gw.id) : undefined;
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);

  const [formation, setFormation] = useState<FormationKey>((existing?.formation as FormationKey) ?? "4-4-2");
  const [selected, setSelected] = useState<string[]>(existing ? existing.picks.map((p) => p.playerId) : []);
  const [starters, setStarters] = useState<string[]>(existing ? existing.picks.filter((p) => p.isStarter).map((p) => p.playerId) : []);
  const [captainId, setCaptainId] = useState<string>(existing?.captainId ?? "");
  const [viceId, setViceId] = useState<string>(existing?.viceId ?? "");
  const [saving, setSaving] = useState(false);
  // Unsaved picks survive a refresh or crash: they're kept in a per-gameweek
  // local draft until the squad is saved.
  const draftKey = gw ? `mfc-fantasy-draft:${gw.id}` : null;
  const [draftLoaded, setDraftLoaded] = useState(false);
  const restoredDraftRef = useRef(false);

  useEffect(() => {
    setDraftLoaded(false);
    restoredDraftRef.current = false;
    const applyExisting = () => {
      if (!existing) return;
      setFormation(existing.formation as FormationKey);
      setSelected(existing.picks.map((p) => p.playerId));
      setStarters(existing.picks.filter((p) => p.isStarter).map((p) => p.playerId));
      setCaptainId(existing.captainId ?? "");
      setViceId(existing.viceId ?? "");
    };
    if (!draftKey) {
      applyExisting();
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Partial<SavePayload> & { selected?: string[] };
        if (Array.isArray(d.selected) && d.selected.length) {
          if (d.formation) setFormation(d.formation as FormationKey);
          setSelected(d.selected);
          setStarters(Array.isArray(d.starters) ? d.starters : []);
          setCaptainId(d.captainId ?? "");
          setViceId(d.viceId ?? "");
          restoredDraftRef.current = true;
        }
      }
    } catch {
      /* ignore corrupt drafts */
    }
    if (!restoredDraftRef.current) applyExisting();
    setDraftLoaded(true);
  }, [draftKey, existing?.id]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    try {
      if (!selected.length) localStorage.removeItem(draftKey);
      else
        localStorage.setItem(
          draftKey,
          JSON.stringify({ formation, selected, starters, captainId, viceId, at: Date.now() }),
        );
    } catch {
      /* storage full or blocked — drafting still works in-memory */
    }
  }, [draftKey, draftLoaded, formation, selected, starters, captainId, viceId]);

  const counts = formationCounts(formation);
  /** Bench size follows the real substitute rules of this gameweek's competition. */
  const benchRules = useMemo(() => benchRulesFor(gw?.competition), [gw?.competition]);
  const squadSize = 11 + benchRules.size;
  /** Match day 11 for the chosen formation plus the full bench allowance (no minimum cover). */
  const posQuota = useMemo(() => {
    const c = counts as Record<FantasyPosition, number>;
    return {
      // One starting GK + one replacement GK (sub 1). Other positions can fill the rest of the bench.
      gk: c.gk + 1,
      def: c.def + benchRules.size,
      mid: c.mid + benchRules.size,
      fwd: c.fwd + benchRules.size,
    } as Record<FantasyPosition, number>;
  }, [formation, benchRules]);
  const byPos = (ids: string[], pos: FantasyPosition) => ids.filter((id) => playerById.get(id)?.position === pos);
  const bench = selected
    .filter((id) => !starters.includes(id))
    .sort(
      (a, b) =>
        POSITION_ORDER.indexOf(playerById.get(a)?.position ?? "gk") -
        POSITION_ORDER.indexOf(playerById.get(b)?.position ?? "gk"),
    );
  const locked = !!gw && (gw.status !== "upcoming" || new Date(gw.lockAt).getTime() <= Date.now());

  const xiProblems: string[] = [];
  if (starters.length !== 11) xiProblems.push(`Pick 11 starters (${starters.length} selected).`);
  else {
    for (const pos of POSITION_ORDER) {
      const n = byPos(starters, pos).length;
      if (n !== (counts as any)[pos]) xiProblems.push(`${formation}: needs ${(counts as any)[pos]} ${POSITION_SHORT[pos]} in the XI, you have ${n}.`);
    }
  }
  if (bench.length !== benchRules.size)
    xiProblems.push(`${benchRules.competition} allows ${benchRules.size} subs — name ${benchRules.size} (you have ${bench.length}).`);
  const benchGkCount = byPos(bench, "gk").length;
  if (benchGkCount < benchRules.minGk)
    xiProblems.push(`Your bench needs at least ${benchRules.minGk} goalkeeper (you have ${benchGkCount}).`);
  if (!captainId || !starters.includes(captainId)) xiProblems.push("Pick a captain from your starting XI.");
  if (!viceId || !starters.includes(viceId)) xiProblems.push("Pick a vice-captain from your starting XI.");
  if (captainId && captainId === viceId) xiProblems.push("Captain and vice-captain must be different.");

  const problems = xiProblems;
  const activeChecklist = { title: "Match day 11 checklist", items: xiProblems };

  // Live points for this gameweek, straight from the saved squad.
  const pointsByPlayer = useMemo(
    () => new Map((existing?.picks ?? []).map((p) => [p.playerId, p.points])),
    [existing],
  );
  const autoSubbedIds = useMemo(
    () => new Set((existing?.picks ?? []).filter((p) => p.autoSubbed).map((p) => p.playerId)),
    [existing],
  );
  // Game time played in this gameweek's fixture, once any stats are in.
  const minutesByPlayer = useMemo(() => {
    const picks = existing?.picks ?? [];
    const hasStats = picks.some((p) => p.minutes !== null && p.minutes !== undefined);
    if (!hasStats) return new Map<string, number>();
    return new Map(picks.map((p) => [p.playerId, p.minutes ?? 0]));
  }, [existing]);
  const hasGwPoints = (existing?.picks ?? []).some((p) => p.points !== null);

  const editable = !locked && (canPlay || !gw);

  // Position pop-box picker: either filling/swapping an XI slot, or a bench slot.
  const [picker, setPicker] = useState<
    | { mode: "xi"; pos: FantasyPosition; replaceId?: string }
    | { mode: "bench"; benchIndex: number }
    | null
  >(null);

  // Only highlight Save when something actually differs from the saved squad.
  const dirty = useMemo(() => {
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
    if (!existing) return selected.length > 0;
    const savedSelected = existing.picks.map((p) => p.playerId);
    const savedStarters = existing.picks.filter((p) => p.isStarter).map((p) => p.playerId);
    return (
      existing.formation !== formation ||
      (existing.captainId ?? "") !== captainId ||
      (existing.viceId ?? "") !== viceId ||
      !sameSet(savedSelected, selected) ||
      !sameSet(savedStarters, starters)
    );
  }, [existing, formation, captainId, viceId, selected, starters]);

  /** Ensure the player is in the 15 — returns the new squad list, or null if not possible. */
  function withPlayer(sel: string[], p: FantasyPlayerDTO): string[] | null {
    if (sel.includes(p.id)) return sel;
    if (p.status === "departed") { toast.error(`${p.name} has left the club.`); return null; }
    if (p.status === "loaned_out") { toast.error(`${p.name} is out on loan${p.loanClub ? ` at ${p.loanClub}` : ""}.`); return null; }
    if (sel.length >= squadSize) { toast.error(`Squad is full — ${squadSize} players max (11 + ${benchRules.size} subs).`); return null; }
    if (byPos(sel, p.position).length >= posQuota[p.position]) {
      toast.error(`${formation} only needs ${posQuota[p.position]} ${POSITION_SHORT[p.position]}s (XI + bench).`);
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
    const p = playerById.get(id);
    const benchHasGk = byPos(selected, "gk").some((x) => x !== id && !starters.includes(x));
    if (p && p.position !== "gk" && !benchHasGk) {
      toast.error("Sub 1 must be the replacement goalkeeper — pick a GK first.");
      return;
    }
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

  /** Add a player to the bench (or squad only). Sub 1 is reserved for the replacement GK. */
  function benchAdd(p: FantasyPlayerDTO) {
    if (!editable) return;
    const benchHasGk = byPos(selected, "gk").some((id) => !starters.includes(id));
    if (p.position !== "gk" && !benchHasGk) {
      toast.error("Sub 1 must be the replacement goalkeeper — pick a GK first.");
      return;
    }
    const sel = withPlayer(selected, p);
    if (!sel) return;
    setSelected(sel);
    setStarters((prev) => prev.filter((x) => x !== p.id));
  }

  /** Fill any gaps in the match day 11 (and captaincy) from the players picked. */
  function autoCompleteXI() {
    const st: string[] = [];
    for (const pos of POSITION_ORDER) {
      const need = (counts as Record<string, number>)[pos] ?? 0;
      const pool = byPos(selected, pos)
        .slice()
        .sort((a, b) => (playerById.get(b)?.seasonPoints ?? 0) - (playerById.get(a)?.seasonPoints ?? 0));
      st.push(...pool.slice(0, need));
    }
    const ranked = st
      .slice()
      .sort((a, b) => (playerById.get(b)?.seasonPoints ?? 0) - (playerById.get(a)?.seasonPoints ?? 0));
    return { starters: st, captainId: ranked[0] ?? "", viceId: ranked[1] ?? "" };
  }

  async function handleSave() {
    if (!gw) return;
    let st = starters;
    let cap = captainId;
    let vice = viceId;
    const needsAutoXI = starters.length !== 11;
    if (needsAutoXI) {
      const auto = autoCompleteXI();
      if (auto.starters.length !== 11 || !auto.captainId || !auto.viceId) {
        toast.error("Complete your squad of 15 first.");
        return;
      }
      st = auto.starters;
      cap = auto.captainId;
      vice = auto.viceId;
      setStarters(st);
      setCaptainId(cap);
      setViceId(vice);
    }
    const bn = selected.filter((id) => !st.includes(id));
    setSaving(true);
    try {
      await onSave({ gameweekId: gw.id, formation, starters: st, bench: bn, captainId: cap, viceId: vice });
      // Saved to the server — the local draft is no longer needed.
      restoredDraftRef.current = false;
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      }
      toast.success(
        needsAutoXI
          ? "Saved — we completed your match day 11, tweak it any time before the deadline."
          : "Match day 11 saved.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save squad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-[200px]">
            {gw ? (
              <>
                <div className="font-semibold">GW{gw.gwNumber} — {gw.homeTeam} v {gw.awayTeam}</div>
                <div className="text-xs text-muted-foreground">{gw.dateTbc ? "Date to be confirmed" : kickoffLabel(gw.kickoffAt)}</div>
              </>
            ) : (
              <>
                <div className="font-semibold">Pre-season — no gameweek open yet</div>
                <div className="text-xs text-muted-foreground">Try out formations and squads now; you can save once the first gameweek opens.</div>
              </>
            )}
            {openByGroup.league.length > 1 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">League games</span>
                <Select value={gwId} onValueChange={setGwId}>
                  <SelectTrigger className="h-8 min-w-0 flex-1 text-xs [&>span]:truncate">
                    <SelectValue placeholder="Pick a league gameweek" />
                  </SelectTrigger>
                  <SelectContent>
                    {openByGroup.league.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        GW{g.gwNumber} — {g.homeTeam} v {g.awayTeam} ({g.dateTbc ? "date TBC" : kickoffLabel(g.kickoffAt)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {openByGroup.cup.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">Cup games</span>
                <Select value={openByGroup.cup.some((g) => g.id === gwId) ? gwId : ""} onValueChange={setGwId}>
                  <SelectTrigger className="h-8 min-w-0 flex-1 text-xs [&>span]:truncate">
                    <SelectValue placeholder="Pick a cup gameweek" />
                  </SelectTrigger>
                  <SelectContent>
                    {openByGroup.cup.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        GW{g.gwNumber} — {g.homeTeam} v {g.awayTeam} ({g.dateTbc ? "date TBC" : kickoffLabel(g.kickoffAt)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {openByGroup.playoff.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">Play-off games</span>
                <Select value={openByGroup.playoff.some((g) => g.id === gwId) ? gwId : ""} onValueChange={setGwId}>
                  <SelectTrigger className="h-8 min-w-0 flex-1 text-xs [&>span]:truncate">
                    <SelectValue placeholder="Pick a play-off gameweek" />
                  </SelectTrigger>
                  <SelectContent>
                    {openByGroup.playoff.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        GW{g.gwNumber} — {g.homeTeam} v {g.awayTeam} ({g.dateTbc ? "date TBC" : kickoffLabel(g.kickoffAt)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {gw && (
              <div className="mt-3">
                <DigitalLockCountdown lockAt={gw.lockAt} compact />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-bold text-foreground">{starters.length}</span>/11 picked
              </span>
              <span>
                bench <span className="font-bold text-foreground">{bench.length}</span>/{benchRules.size}
              </span>
              {existing && (hasGwPoints || existing.points !== null) && (
                <span>
                  GW points <span className="font-bold text-primary tabular-nums">{existing.points ?? 0}</span>
                </span>
              )}
            </div>
            <Button
              onClick={handleSave}
              variant={dirty ? "default" : "outline"}
              className={
                dirty && problems.length === 0
                  ? "bg-gradient-primary text-white shadow-glow ring-2 ring-primary/60 animate-pulse"
                  : dirty
                    ? ""
                    : "opacity-60"
              }
              title={dirty ? undefined : "No changes to save"}
              disabled={saving || locked || !gw || !canPlay || !dirty || problems.length > 0}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : !dirty ? "Saved" : "Save Matchday Squad"}
            </Button>
          </div>
        </div>
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
        <div className="grid gap-4 items-start">
          <PitchView
              formation={formation}
              onFormationChange={(f) => setFormation(f)}
              editable={editable}
              playerById={playerById}
              starters={starters}
              bench={bench}
              captainId={captainId}
              viceId={viceId}
              benchSize={benchRules.size}
              pointsByPlayer={hasGwPoints ? pointsByPlayer : undefined}
              minutesByPlayer={minutesByPlayer.size ? minutesByPlayer : undefined}
              autoSubbedIds={autoSubbedIds}
              onSlotOpen={(pos, replaceId) => setPicker({ mode: "xi", pos, replaceId })}
              onBenchSlotOpen={(benchIndex) => setPicker({ mode: "bench", benchIndex })}
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
        </div>

        <div className="grid gap-4 items-start lg:sticky lg:top-4">
          <ManagerCard
            state={state}
            name={name}
            teamName={teamName}
            canEdit={canEdit}
            onEdit={onEdit}
          />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Formation</span>
            <select
              className="h-9 min-w-0 flex-1 rounded-lg border-2 border-primary/50 bg-background px-2 text-sm font-semibold"
              value={formation}
              onChange={(e) => setFormation(e.target.value as FormationKey)}
              disabled={!editable}
            >
              {FORMATION_KEYS.map((f) => (
                <option key={f} value={f}>{f} — {FORMATIONS[f].label}</option>
              ))}
            </select>
          </label>
        {/* Checklist — scoped to the active tab (squad of 15 vs starting 11). */}
        <aside className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center gap-2">
            <h3 className="font-display font-bold text-sm">{activeChecklist.title}</h3>
            {canPlay && !locked && (
              <span
                className={
                  "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold border " +
                  (activeChecklist.items.length === 0
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-destructive/40 bg-destructive/15 text-destructive")
                }
              >
                {activeChecklist.items.length === 0 ? "Ready" : `${activeChecklist.items.length} to fix`}
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
            ) : activeChecklist.items.length === 0 ? (
              <p className="text-xs text-emerald-300">
                Match day 11 and bench are valid — hit <span className="font-semibold">Save Matchday Squad</span>.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {activeChecklist.items.map((p) => (
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

      <PlayerPickerDialog
        open={!!picker}
        onOpenChange={(o) => { if (!o) setPicker(null); }}
        players={state.players}
        selected={selected}
        position={
          picker && picker.mode === "xi"
            ? picker.pos
            : picker && picker.mode === "bench" && picker.benchIndex === 0
              ? "gk"
              : undefined
        }
        title={
          picker && picker.mode === "xi"
            ? `Pick a ${POSITION_LABEL[picker.pos] ?? POSITION_SHORT[picker.pos]}`
            : picker && picker.mode === "bench" && picker.benchIndex === 0
              ? "Pick a replacement goalkeeper"
              : "Pick a substitute"
        }
        onPick={(p) => {
          if (!picker) return;
          if (picker.mode === "xi") startPlayer(p, picker.replaceId);
          else benchAdd(p);
          setPicker(null);
        }}
      />
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

type PickerLevel = "first" | "u21" | "u18";

function levelOf(p: FantasyPlayerDTO): PickerLevel {
  return p.squadLevel === "u21" ? "u21" : p.squadLevel === "u18" ? "u18" : "first";
}

/**
 * Pop-box player picker. Opened from an XI slot (filtered to that position) or a
 * bench slot (every remaining player), split into First team / U21 / U18 tabs.
 */
function PlayerPickerDialog({
  open, onOpenChange, players, selected, position, title, onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  players: FantasyPlayerDTO[];
  selected: string[];
  position?: FantasyPosition;
  title: string;
  onPick: (p: FantasyPlayerDTO) => void;
}) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<PickerLevel>("first");
  useEffect(() => { if (open) { setQ(""); setLevel("first"); } }, [open]);

  const pool = useMemo(() => {
    const term = q.trim().toLowerCase();
    return players
      .filter((p) => !selected.includes(p.id))
      .filter((p) => (position ? p.position === position : true))
      .filter((p) => (term ? p.name.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const unavail = (s: string) => (s === "departed" || s === "loaned_out" ? 1 : 0);
        const gone = unavail(a.status) - unavail(b.status);
        if (gone !== 0) return gone;
        return (
          POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
          (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0)
        );
      });
  }, [players, selected, position, q]);

  const groups: Record<PickerLevel, FantasyPlayerDTO[]> = useMemo(() => {
    const g: Record<PickerLevel, FantasyPlayerDTO[]> = { first: [], u21: [], u18: [] };
    for (const p of pool) g[levelOf(p)].push(p);
    return g;
  }, [pool]);

  const list = groups[level];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>Tap a player to put them straight into the slot.</DialogDescription>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players…"
          className="h-9 border-2 border-primary/40"
        />
        <div className="flex flex-wrap gap-1">
          {(["first", "u21", "u18"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={`text-[11px] rounded-full px-2.5 py-1 border transition-colors ${
                level === l
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {l === "first" ? "First team" : l === "u21" ? "U21" : "U18"}
              <span className="ml-1 opacity-70">{groups[l].length}</span>
            </button>
          ))}
        </div>
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-border/40 rounded-xl border border-border/60">
          {list.map((p) => {
            const unavailable = p.status === "departed" || p.status === "loaned_out";
            return (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={`text-[10px] font-bold rounded-md border px-1.5 py-0.5 ${POS_TINT[p.position]}`}>
                  {POSITION_SHORT[p.position]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`truncate font-medium ${unavailable ? "line-through decoration-2 decoration-destructive text-muted-foreground" : ""}`}>
                      {p.name}
                    </span>
                    {(p.squadLevel === "u21" || p.squadLevel === "u18") && (
                      <span className="shrink-0 rounded-md border border-sky-500/40 bg-sky-500/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-500">
                        {p.squadLevel === "u21" ? "U21" : "U18"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    <span className="text-foreground/80">{p.seasonPoints ?? 0} pts</span>
                    {p.status === "loaned_out" ? (
                      <span className="ml-1 text-destructive uppercase">out on loan{p.loanClub ? ` · ${p.loanClub}` : ""}</span>
                    ) : (
                      p.status !== "active" && <span className="ml-1 text-destructive uppercase">{p.status}</span>
                    )}
                    {p.status !== "loaned_out" && p.loanFrom && (
                      <span className="ml-1 text-amber-500 uppercase">on loan from {p.loanFrom}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  disabled={unavailable}
                  title={unavailable ? "Not available for selection" : "Put in this slot"}
                  className="shrink-0 grid place-items-center size-7 rounded-lg border border-primary/50 text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                >
                  {unavailable ? <X className="size-3.5 text-destructive" /> : <Plus className="size-3.5" />}
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No players available here.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Pitch
// ------------------------------------------------------------------
function PitchView({
  formation, onFormationChange, editable, playerById, starters, bench, captainId, viceId,
  benchSize, pointsByPlayer, minutesByPlayer, autoSubbedIds, onDropStart, onDropBench, onBench, onRemove, onCaptain, onVice,
  onSlotOpen, onBenchSlotOpen,
}: {
  formation: FormationKey;
  onFormationChange: (f: FormationKey) => void;
  editable: boolean;
  playerById: Map<string, FantasyPlayerDTO>;
  starters: string[];
  bench: string[];
  captainId: string;
  viceId: string;
  benchSize: number;
  pointsByPlayer?: Map<string, number | null>;
  minutesByPlayer?: Map<string, number | null>;
  autoSubbedIds?: Set<string>;
  onSlotOpen: (pos: FantasyPosition, replaceId?: string) => void;
  onBenchSlotOpen: (benchIndex: number) => void;
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

  // Starters that don't fit the chosen formation (e.g. after switching shape) would
  // otherwise vanish from the pitch — show them in an overflow row so all 15 of the
  // squad are always visible and moveable.
  const overflow = POSITION_ORDER.flatMap((pos) => queues[pos] ?? []);

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
        <p className="text-xs text-muted-foreground">
          Tap any slot to pick a player from the pop-up list.
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
                    onClick={() => { if (editable && !id) onSlotOpen(row.pos); }}
                    role={editable && !id ? "button" : undefined}
                    className={`min-w-[68px] flex-1 max-w-[110px] sm:max-w-[120px] rounded-xl border px-1.5 py-2 text-center backdrop-blur-sm transition-colors ${
                      p ? "border-white/40 bg-slate-950/70" : "cursor-pointer border-dashed border-white/40 bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    {p ? (
                      <>
                        <div className="flex items-center justify-center gap-1">
                          <Shirt className="size-4 text-white/80" />
                          {captainId === p.id && <Crown className="size-3.5 text-amber-400" />}
                          {viceId === p.id && <Star className="size-3.5 text-sky-300" />}
                        </div>
                        <div className="mt-1 text-[10px] font-semibold leading-tight text-white break-words line-clamp-2 min-h-[24px]">{p.name}</div>
                        <div className="text-[10px] tabular-nums text-white/70">{p.seasonPoints ?? 0} pts</div>
                        {pointsByPlayer?.has(p.id) && (
                          <div className="mt-1 inline-flex items-center rounded-full border border-emerald-400/50 bg-emerald-500/20 px-1.5 text-[10px] font-bold tabular-nums text-emerald-200">
                            {pointsByPlayer.get(p.id) ?? 0} pts
                          </div>
                        )}
                        {minutesByPlayer?.has(p.id) && (
                          <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-white/80">
                            {(minutesByPlayer.get(p.id) ?? 0) > 0 ? `${minutesByPlayer.get(p.id)}′ played` : "Didn't play"}
                          </div>
                        )}
                        {editable && (
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <button type="button" title="Captain" onClick={() => onCaptain(p.id)} className={`rounded p-0.5 ${captainId === p.id ? "text-amber-400" : "text-white/50 hover:text-white"}`}>
                              <Crown className="size-3" />
                            </button>
                            <button type="button" title="Vice-captain" onClick={() => onVice(p.id)} className={`rounded p-0.5 ${viceId === p.id ? "text-sky-300" : "text-white/50 hover:text-white"}`}>
                              <Star className="size-3" />
                            </button>
                            <button type="button" title="Swap this player" onClick={() => onSlotOpen(row.pos, p.id)} className="rounded p-0.5 text-white/50 hover:text-white">
                              <ArrowRightLeft className="size-3" />
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
        {overflow.length > 0 && (
          <div className="relative mt-4 rounded-xl border border-amber-400/60 bg-amber-500/15 p-2">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-200">
              Not in this formation — move to the bench or swap into a slot
            </div>
            <div className="flex flex-wrap gap-2">
              {overflow.map((id) => {
                const p = playerById.get(id);
                if (!p) return null;
                return (
                  <div
                    key={id}
                    draggable={editable}
                    onDragStart={(e) => e.dataTransfer.setData("text/fantasy-player", id)}
                    className="min-w-[68px] max-w-[120px] flex-1 rounded-xl border border-white/40 bg-slate-950/70 px-1.5 py-2 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className={`rounded-md border px-1 text-[10px] font-bold ${POS_TINT[p.position]}`}>{POSITION_SHORT[p.position]}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 min-h-[24px] break-words text-[10px] font-semibold leading-tight text-white">{p.name}</div>
                    <div className="text-[10px] tabular-nums text-white/70">{p.seasonPoints ?? 0} pts</div>
                    {editable && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <button type="button" title="Move to bench" onClick={() => onBench(p.id)} className="rounded p-0.5 text-white/60 hover:text-white">
                          <ArrowDown className="size-3" />
                        </button>
                        <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-white/60 hover:text-destructive">
                          <X className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/60" {...dropProps(onDropBench)}>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Bench ({bench.length}/{benchSize})</div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.max(benchSize, bench.length) }, (_, i) => BENCH_SLOT_LABELS[i] ?? "Sub").map((slotLabel, i) => {
            const id = bench[i];
            const p = id ? playerById.get(id) : undefined;
            return (
              <div
                key={i}
                {...dropProps(onDropBench)}
                draggable={editable && !!id}
                onDragStart={(e) => { if (id) e.dataTransfer.setData("text/fantasy-player", id); }}
                onClick={() => { if (editable && !id) onBenchSlotOpen(i); }}
                role={editable && !id ? "button" : undefined}
                className={`min-w-[68px] flex-1 max-w-[110px] sm:max-w-[120px] rounded-xl border px-1.5 py-2 text-center text-xs ${
                  p ? "border-border/70 bg-muted/40" : "cursor-pointer border-dashed border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {p ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[10px] font-bold rounded-md border px-1 bg-slate-700 text-white border-white/20">SUB</span>
                    </div>
                    <div className="mt-1 text-[10px] font-semibold leading-tight break-words line-clamp-2 min-h-[24px]">{p.name}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground">{p.seasonPoints ?? 0} pts</div>
                    {pointsByPlayer?.has(p.id) && (
                      <div className="mt-1 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-1.5 text-[10px] font-bold tabular-nums text-emerald-400">
                        {pointsByPlayer.get(p.id) ?? 0} pts
                      </div>
                    )}
                    {minutesByPlayer?.has(p.id) && (
                      <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {(minutesByPlayer.get(p.id) ?? 0) > 0 ? `${minutesByPlayer.get(p.id)}′ played` : "Didn't play"}
                      </div>
                    )}
                    {autoSubbedIds?.has(p.id) && (
                      <div className="mt-0.5 text-[9px] font-bold uppercase text-sky-400">Subbed on</div>
                    )}
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
                  <div className="py-3 font-semibold">
                    <div className="mx-auto mb-1 grid size-6 place-items-center rounded-full border border-border/70">
                      <Plus className="size-3" />
                    </div>
                    {slotLabel}
                  </div>
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
function GameweekList({ state, group }: { state: FantasyStateDTO; group: FantasyCompetitionGroup }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const renderGw = (g: FantasyStateDTO["gameweeks"][number]) => {
        const squad = state.squads.find((s) => s.gameweekId === g.id);
        const open = openId === g.id;
        const picks = [...(squad?.picks ?? [])].sort((a, b) => a.slotOrder - b.slotOrder);
        const startersList = picks.filter((p) => p.isStarter);
        const benchList = picks.filter((p) => !p.isStarter);
        const xiConfirmed = startersList.length === 11;
        const row = (p: (typeof picks)[number]) => {
          const pl = playerById.get(p.playerId);
          return (
            <div key={p.playerId} className="flex items-center gap-2 py-1 text-sm">
              <span className={`text-[10px] font-bold rounded-md border px-1 ${POS_TINT[pl?.position ?? "mid"]}`}>
                {POSITION_SHORT[pl?.position ?? "mid"]}
              </span>
              <span className="truncate">{pl?.name ?? "Unknown player"}</span>
              {squad?.captainId === p.playerId && <Crown className="size-3.5 text-amber-400" />}
              {squad?.viceId === p.playerId && <Star className="size-3.5 text-sky-300" />}
              {p.autoSubbed && <span className="text-[10px] font-bold uppercase text-sky-400">subbed on</span>}
              <span className="ml-auto font-bold tabular-nums text-primary">{p.points ?? "—"}</span>
            </div>
          );
        };
        return (
          <div key={g.id} className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
            <div className="flex flex-wrap items-center gap-3">
            <div className="w-14 text-xs font-bold text-primary">GW{g.gwNumber}</div>
            <div className="flex-1 min-w-[180px]">
              <div className="font-medium flex items-center gap-1.5">
                <span>{g.homeTeam} v {g.awayTeam}</span>
                {xiConfirmed && (
                  <span title="Starting 11 entered" className="inline-flex items-center gap-1 text-emerald-400">
                    <Check className="size-4" />
                    <span className="text-[10px] font-bold uppercase">XI in</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {g.dateTbc ? "Date to be confirmed" : kickoffLabel(g.kickoffAt)} · {g.competition}
              </div>
            </div>
            {g.homeScore !== null && g.awayScore !== null && (
              <div className="font-bold tabular-nums">{g.homeScore}–{g.awayScore}</div>
            )}
            {g.dateTbc && (
              <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 border border-sky-400/60 bg-sky-400/10 text-sky-300">
                Drawn — date TBC
              </span>
            )}
            {/postpon|cancel|abandon|suspend/i.test(g.fixtureStatus ?? "") && (
              <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 border border-amber-400/60 bg-amber-400/10 text-amber-300">
                Called off — new date TBC
              </span>
            )}
            <span className="text-[10px] uppercase rounded-full px-2 py-0.5 border border-border text-muted-foreground">{g.status}</span>
            {squad && (
              <span className="text-sm">
                <span className="text-muted-foreground">Your points </span>
                <span className="font-bold text-primary">{squad.points ?? "—"}</span>
                {squad.transferCost > 0 && <span className="text-destructive text-xs"> (−{squad.transferCost})</span>}
              </span>
            )}
            {squad && (
              <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : g.id)}>
                {open ? "Hide team" : "View team"}
              </Button>
            )}
            </div>
            {squad && open && (
              <div className="mt-3 grid gap-4 border-t border-border/60 pt-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Starting 11 · {squad.formation}
                  </div>
                  {startersList.map(row)}
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Bench</div>
                  {benchList.map(row)}
                </div>
              </div>
            )}
          </div>
        );
  };

  const items = state.gameweeks.filter((g) => fantasyCompetitionGroup(g.competition) === group);
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        {FANTASY_GROUP_LABEL[group]}
        <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-xs text-muted-foreground">
          {group === "league"
            ? "No league gameweeks yet."
            : group === "cup"
              ? "No cup ties arranged yet — they're added automatically as soon as the draw is made."
              : "No play-off games yet — they're added automatically if Boro qualify."}
        </div>
      ) : (
        <div className="space-y-2">{items.map(renderGw)}</div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Transfers
// ------------------------------------------------------------------
function TransfersTab({ state }: { state: FantasyStateDTO }) {
  return <TransfersTabBody state={state} />;
}

function ClubTransferList({
  title, tone, items,
}: {
  title: string;
  tone: "in" | "out";
  items: FantasyStateDTO["clubTransfers"];
}) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
        <span
          className={
            "text-[10px] font-bold uppercase rounded-full px-2 py-0.5 " +
            (tone === "in" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")
          }
        >
          {tone === "in" ? "IN" : "OUT"}
        </span>
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {tone === "in" ? "No new signings yet this season." : "No departures yet this season."}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((t) => {
            const isLoan = /loan/i.test(t.note ?? "") || /loan/i.test(t.fee ?? "");
            return (
            <li key={t.id} className="px-3 py-2 text-sm flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.playerName}</span>
              <span
                className={
                  "text-[10px] font-bold uppercase rounded-full px-1.5 py-0.5 " +
                  (isLoan ? "bg-amber-500/20 text-amber-400" : "bg-sky-500/20 text-sky-400")
                }
              >
                {isLoan ? (tone === "in" ? "Loan in" : "Loan out") : "Permanent"}
              </span>
              {t.otherClub && (
                <span className="text-muted-foreground text-xs">
                  {tone === "in" ? "from" : "to"} {t.otherClub}
                </span>
              )}
              {t.fee && <span className="text-muted-foreground text-xs">· {t.fee}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(t.transferDate).toLocaleDateString()}
                {t.windowLabel ? ` · ${t.windowLabel}` : ""}
              </span>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TransfersTabBody({ state }: { state: FantasyStateDTO }) {
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p.name])), [state.players]);
  const signings = state.clubTransfers.filter((t) => t.direction === "in");
  const exits = state.clubTransfers.filter((t) => t.direction === "out");
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-primary" /> Middlesbrough 2026/27 transfers
        </h3>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Only players signed or sold since the 2026/27 window opened — squad members already at the club are not listed.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <ClubTransferList title="Signings in" tone="in" items={signings} />
          <ClubTransferList title="Departures" tone="out" items={exits} />
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4">
        <h3 className="font-semibold mb-3">Your team changes</h3>
        <p className="text-sm text-muted-foreground mb-3">
          There are no fantasy transfers any more: pick a fresh match day 11 and bench every gameweek, free and unlimited, right up to each deadline.
        </p>
        {state.myTransfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show — team changes are free.</p>
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
            <th className="text-right px-3 py-2">Transfer Hits</th>
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
          <ClipboardList className="size-5" /> Game rules
        </h3>
        <p className="text-sm text-white/85 mt-1">Everything you need to know before you pick your Middlesbrough side.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: "Match day", v: "11 players" },
            { k: "Bench", v: "Per competition" },
            { k: "Deadline", v: "2 hours pre-KO" },
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
        <h4 className="font-semibold mb-3">Bench cover</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Bench cover applies to Championship games and cup games only. You choose your own 11 and subs, so there's
          no minimum position cover to worry about.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COMPETITION_BENCH_RULES.map((r) => (
            <div key={r.competition} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.competition}</div>
              <div className="font-bold">{r.subs} subs</div>
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
          Only Middlesbrough players score. Any player in your match day 11 who doesn't get on the pitch scores 0.
          Subs who come off the bench score too and their points are added to your total — under 60 minutes they use the
          sub scoring column below, and if they play 60 minutes or more they're scored exactly like a match day 11 player.
          If your captain doesn't play a minute, the vice-captain doubles instead.
        </p>
      </div>
      <Tabs defaultValue="starters">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="starters">Match day 11</TabsTrigger>
          <TabsTrigger value="subs">Subs</TabsTrigger>
        </TabsList>
        <TabsContent value="starters" className="mt-4">
          <ScoringBreakdown column="starter" note="Points for players named in your match day 11. A starter who doesn't get on the pitch scores 0." />
        </TabsContent>
        <TabsContent value="subs" className="mt-4">
          <ScoringBreakdown column="sub" note="Points for players who come off the bench under 60 minutes. A sub who plays 60 minutes or more is scored on the match day 11 column instead. Unused subs score 0." />
        </TabsContent>
      </Tabs>
      <div className="text-sm text-muted-foreground">
        Formations, bench sizes, scoring and deadlines all live on the <span className="font-semibold text-foreground">Game rules</span> tab.
      </div>
    </div>
  );
}

function ScoringBreakdown({ column, note }: { column: "starter" | "sub"; note: string }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/60">
              <th className="py-2 pr-3 font-semibold">Action</th>
              <th className="py-2 px-3 font-semibold whitespace-nowrap">Min game time</th>
              <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {SCORING_RULES.map((r) => (
              <tr key={r.label}>
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{r.minTime}</td>
                <td className="py-2 pl-3 text-right font-bold tabular-nums text-primary">{column === "starter" ? r.starter : r.sub}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Loader2, Lock, Check, Crown, Medal, Award, LogOut, Trash2, Pencil, Star } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import riversideBg from "@/assets/riverside-stadium-bg.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listBoroFixtures,
  upsertBoroPrediction,
  getBoroLeaderboard,
  getBoroEntrantStatus,
  joinBoroPredictor,
  adminDeleteBoroEntrant,
  type BoroFixtureDTO,
  type BoroLeaderboardRowDTO,
} from "@/lib/boro-predictions.functions";
import {
  boroGuestSignInOrRegister,
  boroGuestSignInExisting,
  listBoroFixturesPublic,
  upsertBoroGuestPrediction,
  getBoroLeaderboardPublic,
  requestBoroGuestPinReset,
  resetBoroGuestPin,
} from "@/lib/boro-guest.functions";
import { LandingHeader } from "@/components/LandingHeader";
import { IconRail } from "@/components/app/IconRail";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/boro-predictions")({
  component: BoroPredictionsPage,
});

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function monthLabel(key: string | null, iso: string) {
  const d = key ? new Date(`${key}-01T12:00:00Z`) : new Date(iso);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function isFinished(f: { status?: string | null }) { return (f.status ?? "") === "FINISHED"; }

type GuestSession = { guestId: string; email: string; pin: string; displayName: string };

function BoroPredictionsPage() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("management");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState("fixtures");
  const [fixtures, setFixtures] = useState<BoroFixtureDTO[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<BoroLeaderboardRowDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [guestMode, setGuestMode] = useState<"signin" | "register">("register");

  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--boro-bg-image", `url(${riversideBg})`);
    html.classList.add("boro-bg-active");
    return () => {
      html.classList.remove("boro-bg-active");
      html.style.removeProperty("--boro-bg-image");
    };
  }, []);

  const listFn = useServerFn(listBoroFixtures);
  const upsertFn = useServerFn(upsertBoroPrediction);
  const lbFn = useServerFn(getBoroLeaderboard);
  const statusFn = useServerFn(getBoroEntrantStatus);
  const joinFn = useServerFn(joinBoroPredictor);
  const deleteEntrantFn = useServerFn(adminDeleteBoroEntrant);

  const guestRegisterFn = useServerFn(boroGuestSignInOrRegister);
  const guestSignInExistingFn = useServerFn(boroGuestSignInExisting);
  const listPubFn = useServerFn(listBoroFixturesPublic);
  const upsertGuestFn = useServerFn(upsertBoroGuestPrediction);
  const lbPubFn = useServerFn(getBoroLeaderboardPublic);
  const requestResetFn = useServerFn(requestBoroGuestPinReset);
  const resetPinFn = useServerFn(resetBoroGuestPin);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("boro_guest_session");
      if (raw) setGuest(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const isGuest = !user && !!guest;
  const canPredict = user ? joined : isGuest;
  const myEntrantId = user ? user.id : guest?.guestId ?? null;

  const loadAll = async () => {
    setLoading(true);
    try {
      if (user) {
        const [fx, lb, st] = await Promise.all([listFn(), lbFn(), statusFn()]);
        setFixtures(fx); setLeaderboard(lb as any); setJoined(st.joined);
      } else {
        const creds = guest ? { email: guest.email, pin: guest.pin } : {};
        const [fx, lb] = await Promise.all([listPubFn({ data: creds }), lbPubFn()]);
        setFixtures(fx as any); setLeaderboard(lb as any); setJoined(!!guest);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id, guest?.guestId]);

  const handleJoin = async () => {
    if (!user) { setShowGuestLogin(true); return; }
    setJoining(true);
    try { await joinFn(); setJoined(true); toast.success("You're in!"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setJoining(false); }
  };

  const handleSave = async (fixtureId: string, hp: number, ap: number) => {
    try {
      if (user) await upsertFn({ data: { fixtureId, homePred: hp, awayPred: ap } });
      else if (guest) await upsertGuestFn({ data: { email: guest.email, pin: guest.pin, fixtureId, homePred: hp, awayPred: ap } });
      else { setShowGuestLogin(true); return; }
      toast.success("Prediction saved");
      await loadAll();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
  };

  const handleGuestRegister = async (email: string, pin: string, displayName: string) => {
    setJoining(true);
    try {
      const res = await guestRegisterFn({ data: { email, pin, displayName } });
      const s: GuestSession = { guestId: res.guestId, email: email.trim().toLowerCase(), pin, displayName: res.displayName };
      localStorage.setItem("boro_guest_session", JSON.stringify(s));
      setGuest(s); setShowGuestLogin(false); toast.success("You're in!");
    } catch (e: any) { toast.error(e?.message ?? "Sign-in failed"); }
    finally { setJoining(false); }
  };
  const handleGuestSignIn = async (email: string, pin: string) => {
    setJoining(true);
    try {
      const res = await guestSignInExistingFn({ data: { email, pin } });
      const s: GuestSession = { guestId: res.guestId, email: email.trim().toLowerCase(), pin, displayName: res.displayName };
      localStorage.setItem("boro_guest_session", JSON.stringify(s));
      setGuest(s); setShowGuestLogin(false); toast.success(`Welcome back, ${res.displayName}!`);
    } catch (e: any) { toast.error(e?.message ?? "Sign-in failed"); }
    finally { setJoining(false); }
  };
  const handleGuestSignOut = () => {
    localStorage.removeItem("boro_guest_session"); setGuest(null); toast.success("Signed out.");
  };

  const upcoming = useMemo(() => (fixtures ?? []).filter((f) => !isFinished(f)), [fixtures]);
  const completed = useMemo(() => (fixtures ?? []).filter((f) => isFinished(f)), [fixtures]);
  const myStats = useMemo(
    () => (leaderboard ?? []).find((r) => r.userId === myEntrantId) ?? null,
    [leaderboard, myEntrantId],
  );

  return (
    <div className={user ? "min-h-screen flex bg-background" : "min-h-screen"}>
      {user && <IconRail />}
      <main className="relative flex-1 overflow-y-auto min-w-0">
        {!user && (
          <div className="relative z-10 border-b border-white/10 bg-background/30 backdrop-blur-sm">
            <LandingHeader />
          </div>
        )}
        <div className="w-full px-4 sm:px-8 lg:px-16 py-6">
          <header className="rounded-3xl border border-primary/30 shadow-glow bg-gradient-primary p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="size-12 rounded-2xl bg-white/15 grid place-items-center ring-1 ring-white/20">
                <Trophy className="size-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  Boro 26/27 Predictor
                </h1>
                <p className="text-sm text-white/85">Predict every Middlesbrough fixture this season.</p>
              </div>
              {!user && !guest && !showGuestLogin && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={() => { setGuestMode("signin"); setShowGuestLogin(true); }} className="bg-white text-primary hover:bg-white/90">Guest sign in</Button>
                  <Button variant="outline" onClick={() => { setGuestMode("register"); setShowGuestLogin(true); }} className="bg-white/10 text-white border-white/40 hover:bg-white/20">Guest register</Button>
                </div>
              )}
            </div>
          </header>

          {!canPredict && !showGuestLogin && user && (
            <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 text-sm">
                <div className="font-medium">Join the Boro 26/27 predictor</div>
                <div className="text-muted-foreground">Opt in to submit your scores and appear on the leaderboard.</div>
              </div>
              <Button onClick={handleJoin} disabled={joining}>
                {joining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
              </Button>
            </div>
          )}

          {!user && showGuestLogin && (
            <GuestLoginCard
              busy={joining}
              initialMode={guestMode}
              onRegister={handleGuestRegister}
              onSignIn={handleGuestSignIn}
              onCancel={() => setShowGuestLogin(false)}
              onRequestReset={async (email) => {
                try { await requestResetFn({ data: { email } }); toast.success("If that email is registered, a reset code is on its way."); }
                catch (e: any) { toast.error(e?.message ?? "Could not send reset email"); }
              }}
              onResetPin={async (email, code, newPin) => {
                try {
                  const res = await resetPinFn({ data: { email, code, newPin } });
                  const s: GuestSession = { guestId: res.guestId, email, pin: newPin, displayName: res.displayName };
                  localStorage.setItem("boro_guest_session", JSON.stringify(s));
                  setGuest(s); setShowGuestLogin(false); toast.success("PIN reset — you're signed in.");
                } catch (e: any) { toast.error(e?.message ?? "Reset failed"); }
              }}
            />
          )}

          {isGuest && (
            <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1">
                <div className="font-medium">Signed in as guest: <span className="font-bold">{guest?.displayName}</span></div>
                <div className="text-muted-foreground text-xs">{guest?.email}</div>
              </div>
              <Button size="sm" variant="outline" onClick={handleGuestSignOut}>
                <LogOut className="size-3.5 mr-1" /> Sign out
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-5 w-full sm:w-auto h-auto gap-1 p-1">
              <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="scoring">Scoring</TabsTrigger>
              <TabsTrigger value="prize">Prize</TabsTrigger>
            </TabsList>

            <TabsContent value="fixtures" className="mt-4">
              {loading || !fixtures ? <Loading /> : (
                <FixturesByMonth fixtures={upcoming} canPredict={canPredict} onSave={handleSave} emptyText="No upcoming fixtures yet." ascending />
              )}
            </TabsContent>
            <TabsContent value="results" className="mt-4">
              {loading || !fixtures ? <Loading /> : (
                <FixturesByMonth fixtures={completed} canPredict={false} onSave={handleSave} emptyText="No completed matches yet." ascending={false} />
              )}
            </TabsContent>
            <TabsContent value="leaderboard" className="mt-4">
              {loading || !leaderboard ? <Loading /> : (
                <LeaderboardList
                  rows={leaderboard}
                  currentUserId={myEntrantId}
                  canManage={canManage}
                  onDelete={async (r) => {
                    await deleteEntrantFn({ data: { entrantId: r.userId, isGuest: r.isGuest } });
                    toast.success("Entrant removed");
                    await loadAll();
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="scoring" className="mt-4">
              <div className="rounded-2xl border-2 border-primary/60 bg-surface-1 shadow-md shadow-primary/10 p-5 space-y-4">
                <h3 className="font-display text-lg font-bold">How points are scored</h3>
                <p className="text-xs text-muted-foreground">
                  Each fixture pays out the <span className="text-foreground font-medium">highest</span> tier that
                  matches your prediction — the tiers don&apos;t stack. An exact score is the top prize, so it pays
                  5 pts (not 5 + 3 + 1).
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-12 justify-center px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-bold">5 pts</span>
                    <span><span className="font-medium">Exact score</span> — e.g. you picked 2-0, it finished 2-0.</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-12 justify-center px-2 py-1 rounded bg-primary/80 text-primary-foreground text-xs font-bold">3 pts</span>
                    <span><span className="font-medium">Correct goal difference</span> — right winning margin but wrong scoreline (e.g. picked 3-1, it finished 2-0).</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-12 justify-center px-2 py-1 rounded bg-primary/60 text-primary-foreground text-xs font-bold">1 pt</span>
                    <span><span className="font-medium">Correct result only</span> — right winner (or draw) but wrong margin (e.g. picked 1-0, it finished 2-0).</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-12 justify-center px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-bold">0 pts</span>
                    <span><span className="font-medium">Wrong result</span> — you picked the wrong team to win (or picked a draw when there was a winner).</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">Predictions lock 30 minutes before kick-off.</p>
              </div>
            </TabsContent>

            <TabsContent value="prize" className="mt-4">
              <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/10 via-surface-1 to-surface-1 shadow-md shadow-amber-500/10 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-amber-500/20 grid place-items-center ring-1 ring-amber-400/40">
                    <Trophy className="size-6 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold">Prize</h3>
                    <p className="text-xs text-muted-foreground">For the top of the leaderboard</p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-amber-500 text-black text-xs font-bold">1st place</span>
                    <span>£10 Amazon voucher</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-zinc-300 text-black text-xs font-bold">2nd place</span>
                    <span>£5 Amazon voucher</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-orange-400 text-black text-xs font-bold">3rd place</span>
                    <span>£5 Amazon voucher</span>
                  </li>
                </ul>
                <div className="rounded-xl border border-border bg-surface-2/60 p-3 space-y-2">
                  <p className="text-sm font-semibold">How tie-breakers work</p>
                  <p className="text-xs text-muted-foreground">
                    If two or more players finish on the same total points, we apply the following rules in order until a winner is found:
                  </p>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                    <li>
                      <span className="text-foreground font-medium">Most exact score predictions</span> — whoever called the most final scores spot-on wins.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Most correct match results</span> — next, who called the most win / draw / loss outcomes correctly.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Closest goal difference</span> — total goal-difference error across all matches; lowest wins.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Earliest submission</span> — the player who locked their predictions in first takes the prize.
                    </li>
                  </ol>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <BoroPointsSidebar stats={myStats} loading={loading} joined={canPredict} />
          </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function BoroPointsSidebar({
  stats,
  loading,
  joined,
}: {
  stats: BoroLeaderboardRowDTO | null;
  loading: boolean;
  joined: boolean;
}) {
  const totalPoints = stats?.totalPoints ?? 0;
  const exactCount = stats?.exactCount ?? 0;
  const goalDiffCount = stats?.goalDiffCount ?? 0;
  const resultCount = stats?.resultCount ?? 0;

  return (
    <section className="rounded-2xl border-2 border-primary bg-primary/15 shadow-lg shadow-primary/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/40 bg-primary/25">
        <Star className="size-5 text-primary fill-primary" />
        <h2 className="font-display text-base font-black uppercase tracking-wide text-primary">
          Your Points
        </h2>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="grid place-items-center py-8 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border-2 border-primary bg-primary text-primary-foreground px-4 py-5 text-center shadow-glow">
              <div className="text-xs font-black uppercase tracking-wider opacity-90">Total score</div>
              <div className="font-display text-6xl font-black leading-none tabular-nums">
                {totalPoints}
              </div>
              <div className="text-sm font-bold uppercase tracking-wide">
                point{totalPoints === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-primary/40 bg-surface-1 px-2 py-2">
                <div className="text-lg font-black text-foreground tabular-nums">{exactCount}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Exact · 5pt</div>
              </div>
              <div className="rounded-lg border border-primary/40 bg-surface-1 px-2 py-2">
                <div className="text-lg font-black text-foreground tabular-nums">{goalDiffCount}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Goal diff · 3pt</div>
              </div>
              <div className="rounded-lg border border-primary/40 bg-surface-1 px-2 py-2">
                <div className="text-lg font-black text-foreground tabular-nums">{resultCount}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Result · 1pt</div>
              </div>
            </div>
            {!joined && (
              <div className="mt-3 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Join the predictor to start collecting points.
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Loading() {
  return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
}

function FixturesByMonth({
  fixtures, canPredict, onSave, emptyText, ascending,
}: {
  fixtures: BoroFixtureDTO[];
  canPredict: boolean;
  onSave: (id: string, hp: number, ap: number) => Promise<void>;
  emptyText: string;
  ascending: boolean;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, BoroFixtureDTO[]>();
    const sorted = [...fixtures].sort((a, b) =>
      ascending
        ? +new Date(a.kickoffAt) - +new Date(b.kickoffAt)
        : +new Date(b.kickoffAt) - +new Date(a.kickoffAt),
    );
    for (const f of sorted) {
      const k = f.monthKey ?? f.kickoffAt.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()];
  }, [fixtures, ascending]);

  if (!fixtures.length) {
    return <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="space-y-6">
      {grouped.map(([key, items]) => (
        <div key={key}>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2 px-2 py-1.5 rounded-md bg-surface-2 border-l-4 border-primary">
            {monthLabel(key, items[0].kickoffAt)}
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
  fixture, canPredict, onSave,
}: {
  fixture: BoroFixtureDTO;
  canPredict: boolean;
  onSave: (id: string, hp: number, ap: number) => Promise<void>;
}) {
  const lockMs = new Date(fixture.kickoffAt).getTime() - 30 * 60 * 1000;
  const locked = Date.now() >= lockMs;
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const scored = isFinished(fixture) && hasScore;
  const hasPick = !!fixture.myPrediction;
  const [hp, setHp] = useState(fixture.myPrediction?.homePred?.toString() ?? "");
  const [ap, setAp] = useState(fixture.myPrediction?.awayPred?.toString() ?? "");
  const [editing, setEditing] = useState(!hasPick);
  const [busy, setBusy] = useState(false);
  const dirty = !locked && canPredict && hp !== "" && ap !== "" &&
    (Number(hp) !== fixture.myPrediction?.homePred || Number(ap) !== fixture.myPrediction?.awayPred);

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try { await onSave(fixture.id, Number(hp), Number(ap)); setEditing(false); }
    finally { setBusy(false); }
  };

  const showInputs = !locked && !scored && (editing || !hasPick);

  return (
    <div className="rounded-2xl border-2 border-primary/60 bg-surface-1 p-4 shadow-md shadow-primary/10">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>{fixture.competition}{fixture.venue ? ` · ${fixture.venue}` : ""}</span>
        <span className="font-bold text-foreground tabular-nums">{formatKickoff(fixture.kickoffAt)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right font-medium">{fixture.homeTeam}</div>
        {scored ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.homeScore} – {fixture.awayScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Final</div>
          </div>
        ) : locked ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-dashed border-border font-display text-lg font-bold text-muted-foreground">? – ?</div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 mt-1 inline-flex items-center gap-1"><Lock className="size-3" /> Locked</div>
          </div>
        ) : showInputs ? (
          <div className="flex items-center gap-1.5">
            <Input value={hp} onChange={(e) => setHp(e.target.value.replace(/\D/g, "").slice(0, 2))}
              disabled={!canPredict || busy} inputMode="numeric" className="w-12 text-center font-display text-lg font-bold" />
            <span className="text-muted-foreground">–</span>
            <Input value={ap} onChange={(e) => setAp(e.target.value.replace(/\D/g, "").slice(0, 2))}
              disabled={!canPredict || busy} inputMode="numeric" className="w-12 text-center font-display text-lg font-bold" />
          </div>
        ) : (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.myPrediction?.homePred} – {fixture.myPrediction?.awayPred}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Your pick</div>
          </div>
        )}
        <div className="font-medium">{fixture.awayTeam}</div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="text-muted-foreground">
          {fixture.myPrediction ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-emerald-400" />
              Your pick: <span className="font-mono text-foreground">{fixture.myPrediction.homePred} – {fixture.myPrediction.awayPred}</span>
              {fixture.myPrediction.points !== null && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">{fixture.myPrediction.points} pt{fixture.myPrediction.points === 1 ? "" : "s"}</span>
              )}
            </span>
          ) : locked ? <span>No prediction submitted</span> : canPredict ? <span>Enter a score to predict</span> : <span>Join the predictor to enter</span>}
        </div>
        {!locked && !scored && canPredict && (
          showInputs ? (
            <Button size="sm" onClick={save} disabled={!dirty || busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5 mr-1" /> Edit
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function LeaderboardList({
  rows, currentUserId, canManage, onDelete,
}: {
  rows: BoroLeaderboardRowDTO[];
  currentUserId: string | null;
  canManage: boolean;
  onDelete: (r: BoroLeaderboardRowDTO) => Promise<void>;
}) {
  const OWNER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";
  const owner = rows.find((r) => r.userId === OWNER_ID) ?? null;
  const ranked = rows.filter((r) => r.userId !== OWNER_ID);
  const [confirmDelete, setConfirmDelete] = useState<BoroLeaderboardRowDTO | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!rows.length) {
    return <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">No predictions yet — be the first to enter.</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_120px_80px_80px_80px_64px_72px] gap-2 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2 border-b border-border">
        <div>#</div>
        <div>Player</div>
        <div className="text-center">Predictions Entered</div>
        <div className="text-center">Exact</div>
        <div className="text-center">GD</div>
        <div className="text-center">Result</div>
        <div className="text-center">Pts</div>
        <div className="text-center">Type</div>
      </div>
      <ul>
        {ranked.map((r, i) => {
          const rank = i + 1;
          const mine = r.userId === currentUserId;
          return (
            <li key={r.userId} className={`grid grid-cols-[36px_minmax(0,1fr)_120px_80px_80px_80px_64px_72px] gap-2 px-4 py-2.5 text-sm border-b border-border last:border-b-0 ${mine ? "bg-primary/5" : ""}`}>
              <div className="flex items-center">
                {rank === 1 ? <Crown className="size-4 text-yellow-400" />
                  : rank === 2 ? <Medal className="size-4 text-zinc-300" />
                  : rank === 3 ? <Award className="size-4 text-amber-600" />
                  : <span className="text-muted-foreground tabular-nums">{rank}</span>}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate font-medium">{r.displayName || r.username || "Anonymous"}</span>
                {mine && <span className="text-[10px] uppercase text-primary">you</span>}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(r)}
                    disabled={deletingId === r.userId}
                    className="ml-1 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                    title="Delete this entrant"
                    aria-label="Delete entrant"
                  >
                    {deletingId === r.userId ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </button>
                )}
              </div>
              <div className="text-center tabular-nums">{r.predictionsMade}</div>
              <div className="text-center tabular-nums">{r.exactCount}</div>
              <div className="text-center tabular-nums">{r.goalDiffCount}</div>
              <div className="text-center tabular-nums">{r.resultCount}</div>
              <div className="text-center font-display font-bold tabular-nums">{r.totalPoints}</div>
              <div className="flex items-center justify-center">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${r.isGuest ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"}`}>
                  {r.isGuest ? "Guest" : "Site user"}
                </span>
              </div>
            </li>
          );
        })}
        {owner && (
          <li className={`grid grid-cols-[36px_minmax(0,1fr)_120px_80px_80px_80px_64px_72px] gap-2 px-4 py-2.5 text-sm border-t-2 border-border bg-surface-2/40 ${owner.userId === currentUserId ? "bg-primary/5" : ""}`}>
            <div className="flex items-center text-muted-foreground">—</div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate font-medium">{owner.displayName || owner.username || "Anonymous"}</span>
              <span className="text-[10px] uppercase text-primary">owner</span>
            </div>
            <div className="text-center tabular-nums">{owner.predictionsMade}</div>
            <div className="text-center tabular-nums">{owner.exactCount}</div>
            <div className="text-center tabular-nums">{owner.goalDiffCount}</div>
            <div className="text-center tabular-nums">{owner.resultCount}</div>
            <div className="text-center font-display font-bold tabular-nums">{owner.totalPoints}</div>
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-primary/15 text-primary border-primary/40">Owner</span>
            </div>
          </li>
        )}
      </ul>
      {owner && (
        <div className="px-4 py-2 text-[11px] text-muted-foreground bg-surface-2/40 border-t border-border">
          Site owner · playing for fun (not ranked)
        </div>
      )}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o && !deletingId) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entrant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-semibold text-foreground">{confirmDelete?.displayName || confirmDelete?.username || "this entrant"}</span>{" "}
              {confirmDelete?.isGuest ? "(guest)" : "(site user)"} and all of their predictions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingId}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmDelete) return;
                setDeletingId(confirmDelete.userId);
                try { await onDelete(confirmDelete); setConfirmDelete(null); }
                catch (err: any) { toast.error(err?.message ?? "Delete failed"); }
                finally { setDeletingId(null); }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingId ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Deleting…</span> : "Delete entrant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GuestLoginCard({
  busy, initialMode, onRegister, onSignIn, onCancel, onRequestReset, onResetPin,
}: {
  busy: boolean;
  initialMode: "signin" | "register";
  onRegister: (email: string, pin: string, displayName: string) => void;
  onSignIn: (email: string, pin: string) => void;
  onCancel: () => void;
  onRequestReset: (email: string) => Promise<void>;
  onResetPin: (email: string, code: string, newPin: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"signin" | "register" | "reset-request" | "reset-verify">(initialMode);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetting, setResetting] = useState(false);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const registerValid = emailValid && /^\d{4}$/.test(pin) && displayName.trim().length >= 1;
  const signinValid = emailValid && /^\d{4}$/.test(pin);
  const resetValid = emailValid && /^\d{6}$/.test(resetCode) && /^\d{4}$/.test(newPin);

  if (mode === "reset-request" || mode === "reset-verify") {
    return (
      <div className="mb-6 rounded-2xl border-2 border-primary/60 bg-surface-1 p-5">
        <h3 className="font-display text-lg font-bold mb-1">Reset your PIN</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {mode === "reset-request" ? "Enter your email and we'll send a 6-digit reset code." : "Enter the 6-digit code from your email and choose a new 4-digit PIN."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={resetting || mode === "reset-verify"} />
          </div>
          {mode === "reset-verify" && (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reset code</label>
                <Input value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" disabled={resetting} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New PIN</label>
                <Input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" disabled={resetting} />
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 justify-end">
          <Button variant="ghost" onClick={() => { setMode(initialMode); setResetCode(""); setNewPin(""); }} disabled={resetting}>Back</Button>
          {mode === "reset-request" ? (
            <Button onClick={async () => { setResetting(true); try { await onRequestReset(email.trim().toLowerCase()); setMode("reset-verify"); } finally { setResetting(false); } }} disabled={!emailValid || resetting}>
              {resetting ? <Loader2 className="size-4 animate-spin" /> : "Send reset code"}
            </Button>
          ) : (
            <Button onClick={async () => { setResetting(true); try { await onResetPin(email.trim().toLowerCase(), resetCode, newPin); } finally { setResetting(false); } }} disabled={!resetValid || resetting}>
              {resetting ? <Loader2 className="size-4 animate-spin" /> : "Reset PIN & sign in"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border-2 border-primary/60 bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-lg font-bold">{mode === "signin" ? "Guest sign in" : "Register as guest"}</h3>
        <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "register" : "signin")} disabled={busy}>
          {mode === "signin" ? "New here? Register" : "Already registered? Sign in"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {mode === "signin" ? "Enter the email and 4-digit PIN you used when you registered." : "Pick a display name, enter your email, and choose a 4-digit PIN."}
      </p>
      <div className={`grid grid-cols-1 gap-3 ${mode === "signin" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {mode === "register" && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Display name</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 40))} disabled={busy} />
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={busy} autoComplete="email" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">4-digit PIN</label>
          <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" disabled={busy} autoComplete="one-time-code" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="ghost" onClick={() => setMode("reset-request")} disabled={busy}>Forgot PIN?</Button>
        {mode === "signin" ? (
          <Button onClick={() => onSignIn(email.trim().toLowerCase(), pin)} disabled={!signinValid || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        ) : (
          <Button onClick={() => onRegister(email.trim().toLowerCase(), pin, displayName.trim())} disabled={!registerValid || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Register & continue"}
          </Button>
        )}
      </div>
    </div>
  );
}
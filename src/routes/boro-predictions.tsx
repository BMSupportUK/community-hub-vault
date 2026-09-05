import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Loader2, Lock, Check, Crown, Medal, Award, LogOut, Trash2, Pencil, Star, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import riversideBg from "@/assets/riverside-stadium-bg.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WinnersTab } from "@/components/app/WinnersTab";
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
  adminUpsertBoroFixture,
  getEntrantBoroPredictions,
  type BoroFixtureDTO,
  type BoroLeaderboardRowDTO,
  type BoroEntrantPickDTO,
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
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";
import { IconRail } from "@/components/app/IconRail";
import { TeamKit } from "@/lib/boro-team-kits";
import boroPredictionsFanAsset from "@/assets/boro-predictions-fan.jpg.asset.json";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/boro-predictions")({
  component: BoroPredictionsPage,
});

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function monthLabel(key: string | null, iso: string) {
  const d = key ? new Date(`${key}-01T12:00:00Z`) : new Date(iso);
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}
function isFinished(f: { status?: string | null }) { return (f.status ?? "") === "FINISHED"; }
function isLive(f: { status?: string | null }) {
  const s = f.status ?? "";
  return s === "IN_PLAY" || s === "PAUSED" || s === "LIVE";
}
function liveLabel(f: { status?: string | null; minute?: number | null; minuteAdded?: number | null; kickoffAt?: string | null }) {
  if (f.status === "PAUSED") return "HT";
  if (typeof f.minute === "number" && f.minute > 0) {
    const added = typeof f.minuteAdded === "number" && f.minuteAdded > 0 ? f.minuteAdded : 0;
    if (added > 0) {
      const base = f.minute >= 90 ? 90 : f.minute >= 45 && f.minute < 60 ? 45 : f.minute;
      return `${base}+${added}'`;
    }
    if (f.minute > 90) return `90+${f.minute - 90}'`;
    return `${f.minute}'`;
  }
  if (f.kickoffAt) {
    const elapsedMs = Date.now() - new Date(f.kickoffAt).getTime();
    if (elapsedMs > 0) {
      const mins = Math.min(120, Math.floor(elapsedMs / 60000) + 1);
      if (mins > 90) return `90+${mins - 90}'`;
      return `${mins}'`;
    }
  }
  return "LIVE";
}
function LivePill({ fixture }: { fixture: BoroFixtureDTO }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold uppercase tracking-wide tabular-nums">
      <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
      {liveLabel(fixture)}
    </span>
  );
}

function RedCards({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      title={`${count} red card${count === 1 ? "" : "s"}`}
      aria-label={`${count} red card${count === 1 ? "" : "s"}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-2.5 h-3.5 rounded-[2px] bg-red-600 border border-red-900 shadow-[0_0_4px_rgba(220,38,38,0.7)]"
        />
      ))}
    </span>
  );
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
  const urgent = remaining <= 60 * 60 * 1000;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black tracking-wider tabular-nums border-2 shadow-lg uppercase ${
        urgent
          ? "bg-red-500 text-white border-red-300 shadow-red-500/60 animate-pulse"
          : "bg-lime-400 text-black border-lime-200 shadow-lime-400/50"
      }`}
      title="Time left to predict (locks 30 min before kick-off)"
    >
      <Lock className="size-3.5" strokeWidth={3} />
      Locks in {formatCountdown(remaining)}
    </span>
  );
}

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
    if (new URLSearchParams(window.location.search).get("tab") === "winners") setTab("winners");
  }, []);

  const listFn = useServerFn(listBoroFixtures);
  const upsertFn = useServerFn(upsertBoroPrediction);
  const lbFn = useServerFn(getBoroLeaderboard);
  const statusFn = useServerFn(getBoroEntrantStatus);
  const joinFn = useServerFn(joinBoroPredictor);
  const deleteEntrantFn = useServerFn(adminDeleteBoroEntrant);
  const adminUpsertFixtureFn = useServerFn(adminUpsertBoroFixture);

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

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) toast.error(e?.message ?? "Failed to load");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id, guest?.guestId]);

  // Realtime: refresh fixtures + leaderboard when fixtures or predictions change.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => loadAll(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), 1500);
    };
    const channel = supabase
      .channel("boro-standings")
      .on("postgres_changes", { event: "*", schema: "public", table: "boro_fixtures" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "boro_predictions" }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Live-score polling: refresh every 30s when a match is in-play or about to start.
  useEffect(() => {
    if (!fixtures) return;
    const now = Date.now();
    const shouldPoll = fixtures.some((f) => {
      if (isLive(f)) return true;
      if (isFinished(f)) return false;
      const ko = new Date(f.kickoffAt).getTime();
      return now >= ko - 5 * 60 * 1000 && now <= ko + 3 * 60 * 60 * 1000;
    });
    if (!shouldPoll) return;
    const id = window.setInterval(() => loadAll(true), 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

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
      await loadAll(true);
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
  const liveCount = useMemo(() => (fixtures ?? []).filter(isLive).length, [fixtures]);
  const soonCount = useMemo(() => {
    const now = Date.now();
    const end = now + 24 * 60 * 60 * 1000;
    return (fixtures ?? []).filter((f) => {
      if (isLive(f) || isFinished(f)) return false;
      const t = new Date(f.kickoffAt).getTime();
      return t >= now && t < end;
    }).length;
  }, [fixtures]);
  const myStats = useMemo(
    () => (leaderboard ?? []).find((r) => r.userId === myEntrantId) ?? null,
    [leaderboard, myEntrantId],
  );

  const winners = useMemo(() => {
    const competitionFinished = !!fixtures?.length && fixtures.every((f) => isFinished(f));
    if (!competitionFinished || !leaderboard?.length) return [];

    const OWNER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";
    return leaderboard
      .filter((r) => r.userId !== OWNER_ID)
      .slice(0, 3)
      .map((r, index) => ({
        place: (index + 1) as 1 | 2 | 3,
        userId: r.userId,
        isGuest: r.isGuest,
        name: r.displayName || r.username || "Anonymous",
        note: `${r.totalPoints} pt${r.totalPoints === 1 ? "" : "s"}`,
      }));
  }, [fixtures, leaderboard]);

  return (
    <div className={user ? "relative isolate min-h-dvh md:h-dvh md:overflow-hidden flex bg-transparent" : "relative isolate min-h-screen flex bg-transparent"}>
      <img
        src={riversideBg}
        alt=""
        className="pointer-events-none fixed inset-0 z-0 h-screen w-screen object-cover object-center"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "rgba(2, 6, 14, 0.78)" }}
        aria-hidden
      />
      <IconRail />
      <main className="relative z-10 flex-1 overflow-y-auto min-w-0">
        {!user && (
          <div className="relative z-10 border-b border-white/10 bg-background/30 backdrop-blur-sm">
            <FanZonePublicHeader />
          </div>
        )}
        <div className="w-full px-4 sm:px-8 lg:px-16 py-6">
          <div className="mb-3">
            <Link
              to={user ? "/forum" : "/fan-zone"}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 hover:border-white/40"
            >
              <ArrowLeft className="size-3.5" />
              Back to Fan Zone
            </Link>
          </div>
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
                  <Button asChild variant="outline" className="border-white/70 bg-white/10 text-white hover:bg-white/20">
                    <Link to="/login" search={{ next: "/boro-predictions" }}>Boro Fan Zone member login</Link>
                  </Button>
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

          <div className={`grid grid-cols-1 gap-6 ${user || isGuest ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-6 w-full sm:w-auto h-auto gap-1 p-1">
              <TabsTrigger value="fixtures">
                <span className="flex flex-col items-center gap-0.5">
                  <span>Fixtures</span>
                  {(liveCount > 0 || soonCount > 0) && (
                    <span className="inline-flex items-center gap-1">
                      {liveCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                          title={`${liveCount} live now`}
                        >
                          <span className="size-1.5 rounded-full bg-white animate-pulse" />
                          LIVE {liveCount}
                        </span>
                      )}
                      {soonCount > 0 && (
                        <span
                          className="inline-flex items-center rounded-full bg-red-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                          title={`${soonCount} kicking off in the next 24h`}
                        >
                          SOON {soonCount}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="scoring">Scoring</TabsTrigger>
              <TabsTrigger value="prize">Prize</TabsTrigger>
              <TabsTrigger value="winners">Winners</TabsTrigger>
            </TabsList>

            <TabsContent value="fixtures" className="mt-4">
              {!user && !guest ? (
                <PredictionGuestIllustration />
              ) : loading || !fixtures ? <Loading /> : (
                <FixturesByMonth fixtures={upcoming} canPredict={canPredict} canManage={canManage} onSave={handleSave} emptyText="No upcoming fixtures yet." ascending />
              )}
            </TabsContent>
            <TabsContent value="results" className="mt-4">
              {loading || !fixtures ? <Loading /> : (
                <FixturesByMonth fixtures={completed} canPredict={false} canManage={canManage} onSave={handleSave} emptyText="No completed matches yet." ascending={false} />
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
                    <span><span className="font-medium">Right winning margin</span> — right winning margin but wrong scoreline (e.g. picked 3-1, it finished 2-0).</span>
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
                      <span className="text-foreground font-medium">Closest winning margin</span> — total winning-margin error across all matches; lowest wins.
                    </li>
                    <li>
                      <span className="text-foreground font-medium">Earliest submission</span> — the player who locked their predictions in first takes the prize.
                    </li>
                  </ol>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="winners" className="mt-4">
              <WinnersTab
                title="MFC 2026/27 Predictor Winners"
                subtitle="The top 3 will appear automatically once every MFC 2026/27 fixture is finished."
                winners={winners}
                competition="boro2026"
                viewerUserId={user?.id ?? null}
                guestSession={guest}
              />
            </TabsContent>
          </Tabs>

          {(user || isGuest) && (
            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <BoroPointsSidebar stats={myStats} loading={loading} joined={canPredict} />
              <UpcomingMonthCard fixtures={upcoming} />
            </aside>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}

function PredictionGuestIllustration() {
  return (
    <div className="overflow-hidden rounded-3xl border border-primary/30 shadow-glow bg-gradient-primary">
      <div className="grid items-center gap-0 md:grid-cols-2">
        <img
          src={boroPredictionsFanAsset.url}
          alt="A Boro supporter watching a football match from the stadium stands"
          loading="lazy"
          width={1280}
          height={720}
          className="h-full w-full object-cover"
        />
        <div className="p-6 md:p-8 space-y-4 text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            Sign up today to predict — if you've got what it takes to call the score
          </h2>
          <p className="text-sm text-muted-foreground">
            Predict every Middlesbrough fixture this season. Join the predictor
            (or sign in as a guest) to start submitting your scores.
          </p>
        </div>
      </div>
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
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Winning margin · 3pt</div>
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

function UpcomingMonthCard({ fixtures }: { fixtures: BoroFixtureDTO[] }) {
  const now = Date.now();
  const upcoming = useMemo(() => {
    const future = fixtures
      .filter((f) => new Date(f.kickoffAt).getTime() >= now - 2 * 60 * 60 * 1000)
      .sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt));
    if (future.length === 0) return { label: null as string | null, items: [] as BoroFixtureDTO[] };
    const firstKey = future[0].monthKey ?? future[0].kickoffAt.slice(0, 7);
    const items = future.filter((f) => (f.monthKey ?? f.kickoffAt.slice(0, 7)) === firstKey);
    const label = new Date(`${firstKey}-01T12:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric" });
    return { label, items };
  }, [fixtures, now]);

  return (
    <section className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-2/60">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Upcoming this month</div>
        <div className="font-display text-base font-bold">{upcoming.label ?? "No fixtures"}</div>
      </div>
      {upcoming.items.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">Nothing scheduled.</div>
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.items.map((f) => {
            const isBoroHome = /middlesbrough/i.test(f.homeTeam);
            const opponent = isBoroHome ? f.awayTeam : f.homeTeam;
            const d = new Date(f.kickoffAt);
            return (
              <li key={f.id} className="px-3 py-2.5 text-xs flex items-center gap-2">
                <div className="flex flex-col items-center min-w-9">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {d.toLocaleString("en-GB", { month: "short" })}
                  </span>
                  <span className="font-display text-base font-bold leading-none tabular-nums">
                    {d.getDate()}
                  </span>
                </div>
                <TeamKit team={opponent} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    <span className={`inline-block w-5 text-[10px] font-bold ${isBoroHome ? "text-emerald-400" : "text-amber-400"}`}>
                      {isBoroHome ? "H" : "A"}
                    </span>
                    {opponent}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    {f.venue ? ` · ${f.venue}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FixturesByMonth({
  fixtures, canPredict, canManage, onSave, emptyText, ascending,
}: {
  fixtures: BoroFixtureDTO[];
  canPredict: boolean;
  canManage: boolean;
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
  const defaultMonth = (() => {
    if (!ascending) return grouped[0][0];
    const nowKey = new Date().toISOString().slice(0, 7);
    const upcoming = grouped.find(([k]) => k >= nowKey);
    return (upcoming ?? grouped[0])[0];
  })();
  return (
    <Tabs defaultValue={defaultMonth}>
      <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full sm:w-auto justify-start">
        {grouped.map(([key, items]) => {
          const d = new Date(`${key}-01T12:00:00Z`);
          const short = d.toLocaleString("en-GB", { month: "short" });
          const yy = d.getFullYear().toString().slice(2);
          const now = Date.now();
          const soon = now + 24 * 60 * 60 * 1000;
          let live = 0, soonN = 0;
          for (const f of items) {
            if (isLive(f)) { live++; continue; }
            if (isFinished(f)) continue;
            const t = new Date(f.kickoffAt).getTime();
            if (t >= now && t < soon) soonN++;
          }
          return (
            <TabsTrigger key={key} value={key} className={`text-xs ${live > 0 || soonN > 0 ? "animate-pulse" : ""}`}>
              {short} '{yy}
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] tabular-nums">{items.length}</span>
              {live > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-[0_0_8px_rgba(16,185,129,0.7)]">
                  <span className="size-1.5 rounded-full bg-white animate-pulse" /> LIVE {live}
                </span>
              )}
              {soonN > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-red-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-[0_0_8px_rgba(239,68,68,0.7)]">
                  SOON {soonN}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {grouped.map(([key, items]) => (
        <TabsContent key={key} value={key} className="mt-3">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2 px-2 py-1.5 rounded-md bg-surface-2 border-l-4 border-primary">
            {monthLabel(key, items[0].kickoffAt)}
          </h2>
          <div className="grid gap-3">
            {items.map((f) => (
              <FixtureCard key={f.id} fixture={f} canPredict={canPredict} onSave={onSave} />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
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
  const finished = isFinished(fixture);
  const scored = finished && hasScore;
  const live = isLive(fixture);
  const kickoffMs = new Date(fixture.kickoffAt).getTime();
  const upcomingSoon = !live && !finished && kickoffMs - Date.now() <= 24 * 60 * 60 * 1000 && kickoffMs - Date.now() > 0;
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
    <div className={`min-w-0 rounded-2xl border-2 bg-surface-1 p-3 sm:p-4 shadow-md ${
      live
        ? "border-emerald-500/80 shadow-emerald-500/30 animate-pulse"
        : upcomingSoon
          ? "border-red-500/80 shadow-red-500/30 animate-pulse"
          : "border-primary/60 shadow-primary/10"
    }`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground mb-3">
        <span className="flex min-w-0 items-center gap-1.5 flex-wrap">
          <span>{fixture.competition}{fixture.venue ? ` · ${fixture.venue}` : ""}</span>
        </span>
        <span className="inline-flex flex-wrap items-center gap-2">
          {live && <LivePill fixture={fixture} />}
          {!locked && !scored && !live && <LockCountdownPill lockAtMs={lockMs} />}
          <span className="font-bold text-foreground tabular-nums">{formatKickoff(fixture.kickoffAt)}</span>
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center justify-end gap-2 font-medium">
          <RedCards count={fixture.homeReds} />
          <span className="truncate">{fixture.homeTeam}</span>
          <TeamKit team={fixture.homeTeam} />
        </div>
        {scored ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.homeScore} – {fixture.awayScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Final</div>
          </div>
        ) : live && hasScore ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/60 font-display text-lg font-bold tabular-nums text-emerald-200">
              {fixture.homeScore} – {fixture.awayScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-300 mt-1">Live</div>
          </div>
        ) : locked ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-dashed border-border font-display text-lg font-bold text-muted-foreground">? – ?</div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300/90 mt-1 inline-flex items-center gap-1"><Lock className="size-3" /> Locked</div>
          </div>
        ) : showInputs ? (
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-xl border-2 border-primary bg-primary/10 p-2 shadow-glow">
              <div className="flex items-center gap-2">
                <Input
                  value={hp}
                  onChange={(e) => setHp(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  disabled={!canPredict || busy}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-14 h-14 text-center font-display text-2xl font-bold bg-surface-1 border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
                />
                <span className="text-xl font-bold text-primary">–</span>
                <Input
                  value={ap}
                  onChange={(e) => setAp(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  disabled={!canPredict || busy}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-14 h-14 text-center font-display text-2xl font-bold bg-surface-1 border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
                />
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-primary">Enter your score prediction</span>
          </div>
        ) : (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border font-display text-lg font-bold tabular-nums">
              {fixture.myPrediction?.homePred} – {fixture.myPrediction?.awayPred}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Your pick</div>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <TeamKit team={fixture.awayTeam} />
          <span className="truncate">{fixture.awayTeam}</span>
          <RedCards count={fixture.awayReds} />
        </div>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0 text-muted-foreground">
          {fixture.myPrediction ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-emerald-400" />
              Your pick: <span className="font-mono text-foreground">{fixture.myPrediction.homePred} – {fixture.myPrediction.awayPred}</span>
              {fixture.myPrediction.points !== null && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">{fixture.myPrediction.points} pt{fixture.myPrediction.points === 1 ? "" : "s"}</span>
              )}
            </span>
          ) : locked ? <span>No prediction submitted</span> : canPredict ? (
            <span className="inline-flex items-center gap-1.5 text-primary font-semibold">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              Enter a score above, then tap Save
            </span>
          ) : <span>Join the predictor to enter</span>}
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
  const [openEntrant, setOpenEntrant] = useState<BoroLeaderboardRowDTO | null>(null);
  const [picks, setPicks] = useState<BoroEntrantPickDTO[] | null>(null);
  const [picksLoading, setPicksLoading] = useState(false);
  const fetchPicks = useServerFn(getEntrantBoroPredictions);
  useEffect(() => {
    if (!openEntrant) { setPicks(null); return; }
    setPicksLoading(true);
    setPicks(null);
    fetchPicks({ data: { entrantId: openEntrant.userId, isGuest: openEntrant.isGuest } })
      .then((rs) => setPicks(rs))
      .catch((e: any) => toast.error(e?.message ?? "Failed to load picks"))
      .finally(() => setPicksLoading(false));
  }, [openEntrant, fetchPicks]);

  if (!rows.length) {
    return <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">No predictions yet — be the first to enter.</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="grid grid-cols-[20px_1fr_38px_30px_30px_30px_36px_44px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_64px_80px] gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2 border-b border-border [&>div]:whitespace-nowrap">
        <div>#</div>
        <div>Player</div>
        <div className="text-center"><span className="sm:hidden">P</span><span className="hidden sm:inline">Predictions Entered</span></div>
        <div className="text-center" title="Correct score (exact)"><span className="sm:hidden">CS</span><span className="hidden sm:inline">Correct Score</span></div>
        <div className="text-center" title="Right winning margin (3 pts)"><span className="sm:hidden">WM</span><span className="hidden sm:inline">Winning Margin</span></div>
        <div className="text-center" title="Correct result"><span className="sm:hidden">Res</span><span className="hidden sm:inline">Correct Result</span></div>
        <div className="text-center"><span className="sm:hidden">Pts</span><span className="hidden sm:inline">Points</span></div>
        <div className="text-center">Type</div>
      </div>
      <ul>
        {ranked.map((r, i) => {
          const rank = i + 1;
          const mine = r.userId === currentUserId;
          return (
            <li
              key={r.userId}
              className={`grid grid-cols-[20px_1fr_38px_30px_30px_30px_36px_44px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_64px_80px] gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 text-sm border-b border-border last:border-b-0 ${
                mine ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center">
                {rank === 1 ? <Crown className="size-4 text-yellow-400" />
                  : rank === 2 ? <Medal className="size-4 text-zinc-300" />
                  : rank === 3 ? <Award className="size-4 text-amber-600" />
                  : <span className="text-muted-foreground tabular-nums">{rank}</span>}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt="" className="hidden sm:block size-7 rounded-full object-cover bg-surface-2" />
                ) : (
                  <div className="hidden sm:block size-7 rounded-full bg-surface-2" />
                )}
                <button
                  type="button"
                  onClick={() => setOpenEntrant(r)}
                  className="truncate font-medium text-left hover:text-primary hover:underline underline-offset-2 focus:outline-none focus:text-primary"
                  title="View this player's predictions for matches already kicked off"
                >
                  <span className="block truncate">
                    {r.displayName || r.username || "Anonymous"}
                    {mine && <span className="ml-2 text-[10px] uppercase text-primary">you</span>}
                  </span>
                  {canManage && r.email && (
                    <span className="block truncate text-[10px] text-muted-foreground font-normal normal-case">
                      {r.email}
                    </span>
                  )}
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(r)}
                    disabled={deletingId === r.userId}
                    className="ml-1 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                    title="Owner: delete this entrant and their predictions"
                    aria-label="Delete entrant"
                  >
                    {deletingId === r.userId ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </button>
                )}
              </div>
              <div className="text-center tabular-nums">{r.predictionsMade}</div>
              <div className="tabular-nums flex items-center justify-center gap-1">
                <Star className="size-3 text-yellow-400 hidden sm:block" /> {r.exactCount}
              </div>
              <div className="text-center tabular-nums text-muted-foreground">{r.goalDiffCount}</div>
              <div className="text-center tabular-nums">{r.resultCount}</div>
              <div className="text-center font-display font-bold tabular-nums">{r.totalPoints}</div>
              <div className="flex items-center justify-center">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                    r.isGuest
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  }`}
                  title={r.isGuest ? "Playing as guest" : "BM Support site user"}
                >
                  {r.isGuest ? "Guest" : "Site user"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {owner && (
        <div className="border-t-2 border-dashed border-border bg-surface-2/40">
          <div className="px-3 sm:px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Site owner · playing for fun (not ranked)
          </div>
          <div
            className={`grid grid-cols-[20px_1fr_38px_30px_30px_30px_36px_44px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_64px_80px] gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 text-sm ${
              owner.userId === currentUserId ? "bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center text-muted-foreground">—</div>
            <div className="flex items-center gap-2 min-w-0">
              {owner.avatarUrl ? (
                <img src={owner.avatarUrl} alt="" className="hidden sm:block size-7 rounded-full object-cover bg-surface-2" />
              ) : (
                <div className="hidden sm:block size-7 rounded-full bg-surface-2" />
              )}
              <button
                type="button"
                onClick={() => setOpenEntrant(owner)}
                className="truncate font-medium text-left hover:text-primary hover:underline underline-offset-2 focus:outline-none focus:text-primary"
                title="View this player's predictions for matches already kicked off"
              >
                {owner.displayName || owner.username || "Anonymous"}
                <span className="ml-2 text-[10px] uppercase text-primary">owner</span>
              </button>
            </div>
            <div className="text-center tabular-nums">{owner.predictionsMade}</div>
            <div className="tabular-nums flex items-center justify-center gap-1">
              <Star className="size-3 text-yellow-400 hidden sm:block" /> {owner.exactCount}
            </div>
            <div className="text-center tabular-nums text-muted-foreground">{owner.goalDiffCount}</div>
            <div className="text-center tabular-nums">{owner.resultCount}</div>
            <div className="text-center font-display font-bold tabular-nums">{owner.totalPoints}</div>
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-primary/15 text-primary border-primary/40">
                Owner
              </span>
            </div>
          </div>
        </div>
      )}
      <Dialog open={!!openEntrant} onOpenChange={(o) => !o && setOpenEntrant(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{openEntrant?.displayName || openEntrant?.username || "Anonymous"}</span>
              <span className="text-xs font-normal text-muted-foreground">· {openEntrant?.totalPoints ?? 0} pts</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Only matches that have already kicked off are shown.
            </p>
          </DialogHeader>
          {picksLoading ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !picks || picks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No matches have kicked off yet — picks reveal once kick-off passes.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {picks.map((p) => {
                const finished = p.status === "FINISHED" && p.homeScore !== null && p.awayScore !== null;
                return (
                  <li key={p.fixtureId} className="py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">
                        {p.homeTeam} <span className="text-muted-foreground">vs</span> {p.awayTeam}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(p.kickoffAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {finished && (
                          <span className="ml-2 font-mono text-foreground">FT {p.homeScore}-{p.awayScore}</span>
                        )}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-foreground">
                      {p.homePred}-{p.awayPred}
                    </div>
                    <div className="w-12 text-right">
                      {p.points !== null ? (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${p.points >= 5 ? "bg-yellow-500/20 text-yellow-300" : p.points >= 3 ? "bg-emerald-500/20 text-emerald-300" : p.points >= 1 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {p.points} pt{p.points === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
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

  const fieldCls = "mt-1 border-2 border-primary/50 bg-surface-1 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

  if (mode === "reset-request" || mode === "reset-verify") {
    return (
      <div className="mb-6 rounded-2xl border-2 border-primary/80 bg-surface p-5 shadow-soft backdrop-blur-md">
        <h3 className="font-display text-xl font-bold mb-1 text-foreground drop-shadow">Reset your PIN</h3>
        <p className="text-sm text-foreground/90 mb-4">
          {mode === "reset-request" ? "Enter your email and we'll send a 6-digit reset code." : "Enter the 6-digit code from your email and choose a new 4-digit PIN."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">Email</label>
            <Input className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={resetting || mode === "reset-verify"} />
          </div>
          {mode === "reset-verify" && (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">Reset code</label>
                <Input className={fieldCls} value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" disabled={resetting} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">New PIN</label>
                <Input className={fieldCls} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" disabled={resetting} />
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
    <div className="mb-6 rounded-2xl border-2 border-primary/80 bg-surface p-5 shadow-soft backdrop-blur-md">
      <div className="mb-1">
        <h3 className="font-display text-xl font-bold text-foreground drop-shadow">{mode === "signin" ? "Guest sign in" : "Register as guest"}</h3>
      </div>
      <p className="text-sm text-foreground/90 mb-4">
        {mode === "signin" ? "Enter the email and 4-digit PIN you used when you registered." : "Pick a display name, enter your email, and choose a 4-digit PIN."}
      </p>
      <div className={`grid grid-cols-1 gap-3 ${mode === "signin" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {mode === "register" && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">Display name</label>
            <Input className={fieldCls} value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 40))} disabled={busy} />
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">Email</label>
          <Input className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={busy} autoComplete="email" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">4-digit PIN</label>
          <Input className={fieldCls} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" disabled={busy} autoComplete="one-time-code" />
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
import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Loader2, Lock, Check, Star, Crown, Medal, Award, Pencil, CalendarDays, LogOut, Trash2, Menu } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { WinnersTab } from "@/components/app/WinnersTab";
import {
  listWcFixtures,
  upsertWcPrediction,
  getWcLeaderboard,
  getWcEntrantStatus,
  joinWcPredictor,
  getEntrantWcPredictions,
  adminDeleteWcEntrant,
  type WcFixtureDTO,
  type WcLeaderboardRowDTO,
  type WcEntrantPickDTO,
} from "@/lib/wc-predictions.functions";
import {
  guestSignInOrRegister,
  guestSignInExisting,
  listWcFixturesPublic,
  upsertWcGuestPrediction,
  getWcLeaderboardPublic,
  requestGuestPinReset,
  resetGuestPin,
} from "@/lib/wc-guest.functions";
import { teamFlag } from "@/lib/country-flags";
import heroBg from "@/assets/england-world-cup-hero.jpg";
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";
import { IconRail } from "@/components/app/IconRail";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/predictions")({
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
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isLive(f: { status?: string | null }) {
  const s = f.status ?? "";
  return s === "IN_PLAY" || s === "PAUSED" || s === "LIVE";
}

function isFinished(f: { status?: string | null }) {
  return (f.status ?? "") === "FINISHED";
}

function liveLabel(f: {
  status?: string | null;
  minute?: number | null;
  minuteAdded?: number | null;
  kickoffAt?: string | null;
  livePhase?: "ET" | "PENS" | null;
}, sinceMs = 0) {
  if (f.livePhase === "PENS") return "PENS";
  if (f.status === "PAUSED") return "HT";
  const tick = Math.max(0, Math.floor(sinceMs / 60000));
  if (f.livePhase === "ET") {
    // Extra time runs 91-120. Show the running clock when we have one.
    if (typeof f.minute === "number" && f.minute > 0) {
      const added = typeof f.minuteAdded === "number" && f.minuteAdded > 0 ? f.minuteAdded : 0;
      const base = f.minute >= 105 ? 105 : f.minute >= 90 ? 90 : f.minute;
      if (added > 0) return `ET ${base}+${added + tick}'`;
      return `ET ${f.minute + tick}'`;
    }
    return "ET";
  }
  if (typeof f.minute === "number" && f.minute > 0) {
    const added = typeof f.minuteAdded === "number" && f.minuteAdded > 0 ? f.minuteAdded : 0;
    if (added > 0) {
      // Normalise: some feeds report minute=90/45 with added, others report minute=93.
      const base = f.minute >= 90 ? 90 : f.minute >= 45 && f.minute < 60 ? 45 : f.minute;
      return `${base}+${added + tick}'`;
    }
    const m = f.minute + tick;
    if (m > 90) return `90+${m - 90}'`;
    return `${m}'`;
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

function scoreLabel(f: { homeScore?: number | null; awayScore?: number | null }) {
  return f.homeScore !== null && f.homeScore !== undefined && f.awayScore !== null && f.awayScore !== undefined
    ? `${f.homeScore}-${f.awayScore}`
    : null;
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

function LivePill({
  fixture,
  fetchedAt,
}: {
  fixture: {
    status?: string | null;
    minute?: number | null;
    minuteAdded?: number | null;
    kickoffAt?: string | null;
    livePhase?: "ET" | "PENS" | null;
  };
  fetchedAt?: number;
}) {
  // Re-render every 15s so the elapsed-minutes fallback ticks up.
  const now = useNow(15_000);
  const ctxFetchedAt = useContext(FixturesFetchedAtContext);
  const anchor = fetchedAt ?? ctxFetchedAt;
  const since = anchor ? now - anchor : 0;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold uppercase tracking-wide tabular-nums">
      <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
      {liveLabel(fixture, since)}
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

// Anchor timestamp for the most recent fixtures fetch. LivePill / liveLabel
// extrapolate the minute clock from this so the displayed minute ticks every
// 60s between server polls instead of freezing on the last fetched value.
const FixturesFetchedAtContext = createContext<number>(0);

function useLiveSinceMs() {
  const fetchedAt = useContext(FixturesFetchedAtContext);
  const now = useNow(15_000);
  return fetchedAt ? now - fetchedAt : 0;
}

function LiveMinuteText({ fixture }: { fixture: Parameters<typeof liveLabel>[0] }) {
  const since = useLiveSinceMs();
  return <>{liveLabel(fixture, since)}</>;
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

function PredictionsPage() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("management");
  const [joined, setJoined] = useState<boolean>(false);
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState("fixtures");
  const [fixtures, setFixtures] = useState<WcFixtureDTO[] | null>(null);
  const [fixturesAt, setFixturesAt] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<WcLeaderboardRowDTO[] | null>(null);
  const [loading, setLoading] = useState(true);

  const listFixturesFn = useServerFn(listWcFixtures);
  const upsertFn = useServerFn(upsertWcPrediction);
  const leaderboardFn = useServerFn(getWcLeaderboard);
  const statusFn = useServerFn(getWcEntrantStatus);
  const joinFn = useServerFn(joinWcPredictor);

  const guestSignInFn = useServerFn(guestSignInOrRegister);
  const guestSignInExistingFn = useServerFn(guestSignInExisting);
  const listFixturesPublicFn = useServerFn(listWcFixturesPublic);
  const upsertGuestFn = useServerFn(upsertWcGuestPrediction);
  const leaderboardPublicFn = useServerFn(getWcLeaderboardPublic);
  const requestPinResetFn = useServerFn(requestGuestPinReset);
  const resetPinFn = useServerFn(resetGuestPin);

  // Guest session lives in localStorage so the same browser can come back and edit.
  type GuestSession = { guestId: string; email: string; pin: string; displayName: string };
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [guestMode, setGuestMode] = useState<"signin" | "register">("register");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "winners") setTab("winners");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wc_guest_session");
      if (raw) setGuest(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const isGuest = !user && !!guest;
  const canPredict = !!user ? joined : isGuest;
  const myEntrantId = user ? user.id : guest?.guestId ?? null;

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (user) {
        const [fx, lb, st] = await Promise.all([listFixturesFn(), leaderboardFn(), statusFn()]);
        setFixtures(fx);
        setFixturesAt(Date.now());
        setLeaderboard(lb as any);
        setJoined(st.joined);
      } else {
        const creds = guest ? { email: guest.email, pin: guest.pin } : {};
        const [fx, lb] = await Promise.all([
          listFixturesPublicFn({ data: creds }),
          leaderboardPublicFn(),
        ]);
        setFixtures(fx as any);
        setFixturesAt(Date.now());
        setLeaderboard(lb as any);
        setJoined(!!guest);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user) {
      setShowGuestLogin(true);
      return;
    }
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

  const handleSave = async (
    fixtureId: string,
    hp: number,
    ap: number,
    penWinnerPred: "home" | "away" | null = null,
  ) => {
    try {
      if (user) {
        await upsertFn({ data: { fixtureId, homePred: hp, awayPred: ap, penWinnerPred } });
      } else if (guest) {
        await upsertGuestFn({
          data: {
            email: guest.email,
            pin: guest.pin,
            fixtureId,
            homePred: hp,
            awayPred: ap,
            penWinnerPred,
          },
        });
      } else {
        setShowGuestLogin(true);
        return;
      }
      toast.success("Prediction saved");
      await loadAll(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  };

  const handleGuestSignIn = async (email: string, pin: string, displayName: string) => {
    setJoining(true);
    try {
      const res = await guestSignInFn({ data: { email, pin, displayName } });
      const session: GuestSession = {
        guestId: res.guestId,
        email: email.trim().toLowerCase(),
        pin,
        displayName: res.displayName,
      };
      localStorage.setItem("wc_guest_session", JSON.stringify(session));
      setGuest(session);
      setShowGuestLogin(false);
      toast.success("You're in! Start predicting.");
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-in failed");
    } finally {
      setJoining(false);
    }
  };

  const handleGuestSignInExisting = async (email: string, pin: string) => {
    setJoining(true);
    try {
      const res = await guestSignInExistingFn({ data: { email, pin } });
      const session: GuestSession = {
        guestId: res.guestId,
        email: email.trim().toLowerCase(),
        pin,
        displayName: res.displayName,
      };
      localStorage.setItem("wc_guest_session", JSON.stringify(session));
      setGuest(session);
      setShowGuestLogin(false);
      toast.success(`Welcome back, ${res.displayName}!`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-in failed");
    } finally {
      setJoining(false);
    }
  };

  const handleGuestSignOut = () => {
    localStorage.removeItem("wc_guest_session");
    setGuest(null);
    toast.success("Signed out of guest session.");
    loadAll();
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, guest?.guestId]);

  // Realtime: when a fixture's score/status changes or a prediction is
  // scored, refresh fixtures + leaderboard in the background so standings
  // tick over without a page refresh. Debounced so a burst of row updates
  // (e.g. the sync hook writing every match) only triggers one reload.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => loadAll(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), 1500);
    };
    const channel = supabase
      .channel("wc-standings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_fixtures" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_predictions" },
        schedule,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Live-score polling: refresh every 30s while a match is in-play (or paused at
  // HT), and also around kickoff time so the page flips to live on its own —
  // without this, a fixture stuck on TIMED never starts polling.
  useEffect(() => {
    if (!fixtures) return;
    const now = Date.now();
    const shouldPoll = fixtures.some((f) => {
      if (f.status === "IN_PLAY" || f.status === "PAUSED" || f.status === "LIVE") return true;
      if (f.status === "FINISHED") return false;
      const ko = f.kickoffAt ? new Date(f.kickoffAt).getTime() : null;
      // From 5 minutes before kickoff until 3 hours after.
      return ko !== null && now >= ko - 5 * 60 * 1000 && now <= ko + 3 * 60 * 60 * 1000;
    });
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      loadAll(true);
    }, 30_000);
    // Also re-poll the moment the tab regains focus — browsers throttle
    // setInterval on background tabs (sometimes to once per minute), which
    // leaves the displayed minute stale until the user interacts.
    const onVisible = () => {
      if (document.visibilityState === "visible") loadAll(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

  const myStats = useMemo(() => {
    if (!leaderboard || !myEntrantId) return null;
    return (leaderboard as any[]).find((r) => r.userId === myEntrantId) ?? null;
  }, [leaderboard, myEntrantId]);

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

  const liveCount = useMemo(() => {
    if (!fixtures) return 0;
    return fixtures.filter((f) => {
      const s = f.status ?? "";
      return s === "IN_PLAY" || s === "PAUSED" || s === "LIVE";
    }).length;
  }, [fixtures]);

  const upcomingSoonCount = useMemo(() => {
    if (!fixtures) return 0;
    const now = Date.now();
    const end = now + 24 * 60 * 60 * 1000;
    return fixtures.filter((f) => {
      const t = new Date(f.kickoffAt).getTime();
      const s = f.status ?? "";
      if (s === "FINISHED" || s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return false;
      return t >= now && t < end;
    }).length;
  }, [fixtures]);

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
    <FixturesFetchedAtContext.Provider value={fixturesAt}>
    <div className={user ? "min-h-dvh md:h-dvh md:overflow-hidden flex bg-background" : "min-h-dvh flex bg-background"}>
      <IconRail />
      <main className="relative isolate flex-1 overflow-y-auto min-w-0">
        {!user && (
          <div className="relative z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <FanZonePublicHeader />
          </div>
        )}
      {user && (
        <div className="md:hidden sticky top-0 z-30 h-12 border-b border-border bg-rail/90 backdrop-blur flex items-center px-2">
          <Sheet>
            <SheetTrigger
              className="inline-flex items-center justify-center size-9 rounded-md hover:bg-surface-2 text-foreground"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-auto bg-rail border-r border-border">
              <IconRail inSheet />
            </SheetContent>
          </Sheet>
        </div>
      )}
      {/* Full-page hero background (absolute so the parent's bg-background can't cover it) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "rgba(3, 6, 12, 0.78)" }}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-16 py-6">
        <header className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6 mb-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shadow-glow ring-1 ring-white/20">
              <Trophy className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">
                World Cup 2026 Predictor
              </h1>
              <p className="text-sm text-white/85">Predict every fixture.</p>
            </div>
            {!user && !guest && !showGuestLogin && (
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => { setGuestMode("signin"); setShowGuestLogin(true); }}
                  className="w-full sm:w-auto bg-white text-primary hover:bg-white/90"
                >
                  Guest sign in
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => { setGuestMode("register"); setShowGuestLogin(true); }}
                  className="w-full sm:w-auto bg-white/10 text-white border-white/40 hover:bg-white/20"
                >
                  Guest register
                </Button>
              </div>
            )}
          </div>
        </header>

        {!canPredict && !showGuestLogin && user && (
          <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 text-sm">
              <div className="font-medium text-foreground">
                {user ? "Join the predictor — it's free." : "Play along — no account needed."}
              </div>
              <div className="text-muted-foreground">
                {user
                  ? "Opt in to submit your scores and appear on the leaderboard. No payment, no commitment."
                  : "Continue as a guest with your email and a 4-digit PIN. Re-enter the same details next time to edit your picks."}
              </div>
            </div>
            <Button onClick={handleJoin} disabled={joining}>
              {joining ? <Loader2 className="size-4 animate-spin" /> : user ? "Join the predictor" : "Guest sign in"}
            </Button>
          </div>
        )}

        {!user && showGuestLogin && (
          <GuestLoginCard
            busy={joining}
            initialMode={guestMode}
            onSubmit={handleGuestSignIn}
            onSignInExisting={handleGuestSignInExisting}
            onCancel={() => setShowGuestLogin(false)}
            onRequestReset={async (email) => {
              try {
                await requestPinResetFn({ data: { email } });
                toast.success("If that email is registered, a reset code is on its way.");
              } catch (e: any) {
                toast.error(e?.message ?? "Could not send reset email");
              }
            }}
            onResetPin={async (email, code, newPin) => {
              try {
                const res = await resetPinFn({ data: { email, code, newPin } });
                const session: GuestSession = {
                  guestId: res.guestId,
                  email: email.trim().toLowerCase(),
                  pin: newPin,
                  displayName: res.displayName,
                };
                localStorage.setItem("wc_guest_session", JSON.stringify(session));
                setGuest(session);
                setShowGuestLogin(false);
                toast.success("PIN reset — you're signed in.");
                await loadAll();
              } catch (e: any) {
                toast.error(e?.message ?? "Reset failed");
              }
            }}
          />
        )}

        {isGuest && (
          <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm">
            <div className="flex-1">
              <div className="font-medium text-foreground">
                Signed in as guest: <span className="font-bold">{guest?.displayName}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {guest?.email} — your picks save automatically to this email + PIN.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleGuestSignOut}>
              <LogOut className="size-3.5 mr-1" /> Sign out
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="grid grid-cols-7 w-full sm:w-auto h-auto gap-1 p-1">
              <TabsTrigger
                value="fixtures"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span>Fixtures</span>
                  {(liveCount > 0 || upcomingSoonCount > 0) && (
                    <span className="inline-flex items-center gap-1">
                      {liveCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                          title={`${liveCount} live now`}
                        >
                          <span className="size-1.5 rounded-full bg-white animate-pulse" />
                          LIVE {liveCount}
                        </span>
                      )}
                      {upcomingSoonCount > 0 && (
                        <span
                          className="inline-flex items-center rounded-full bg-red-500/90 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                          title={`${upcomingSoonCount} kicking off in the next 24h`}
                        >
                          SOON {upcomingSoonCount}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="results"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                Results
              </TabsTrigger>
              <TabsTrigger
                value="leaderboard"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                Leaderboard
              </TabsTrigger>
              <TabsTrigger
                value="mine"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                My picks
              </TabsTrigger>
              <TabsTrigger
                value="scoring"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                Scoring
              </TabsTrigger>
              <TabsTrigger
                value="prize"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                Prize
              </TabsTrigger>
              <TabsTrigger
                value="winners"
                className="px-1 sm:px-3 py-1.5 text-[11px] sm:text-sm leading-tight whitespace-normal text-center"
              >
                Winners
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fixtures" className="mt-4">
              {loading || !fixtures ? (
                <Loading />
              ) : (
                <FixturesList
                  fixtures={fixtures}
                  canPredict={canPredict}
                  onSave={handleSave}
                />
              )}
            </TabsContent>

            <TabsContent value="results" className="mt-4">
              {loading || !fixtures ? (
                <Loading />
              ) : (
                <FixturesList
                  fixtures={fixtures}
                  canPredict={canPredict}
                  onSave={handleSave}
                  mode="completed"
                />
              )}
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              {loading || !leaderboard ? (
                <Loading />
              ) : (
                <LeaderboardList
                  rows={leaderboard}
                  currentUserId={myEntrantId}
                  canManage={canManage}
                  onChanged={() => loadAll(true)}
                />
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-4">
              {loading || !fixtures ? (
                <Loading />
              ) : (
                <MyPicks fixtures={fixtures.filter((f) => f.myPrediction)} />
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
                <div className="pt-2 mt-2 border-t border-border space-y-2">
                  <h4 className="font-display text-sm font-bold">Knockouts that go to extra time / penalties</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-primary/70 text-primary-foreground text-xs font-bold">Won in ET</span>
                      <span>
                        Match decided in extra time — scored exactly like a regulation game using the
                        <span className="text-foreground font-medium"> final score after extra time</span>
                        (5 / 3 / 1 / 0 as above).
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-emerald-500 text-black text-xs font-bold">Won on pens</span>
                      <span>
                        Match decided on penalties — the recorded scoreline is scored normally
                        (5 / 3 / 1 / 0 as above), plus a
                        <span className="text-foreground font-medium"> +1 bonus </span>
                        only if you used the pens selector and picked the team that won the shootout. If you predicted a
                        <span className="text-foreground font-medium"> draw </span>
                        on a knockout fixture, you&apos;ll get a separate
                        <span className="text-foreground font-medium"> &ldquo;Pick the pens winner&rdquo; </span>
                        selector — picking the correct shootout winner earns the
                        <span className="text-foreground font-medium"> +1 bonus</span>.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="inline-flex min-w-16 justify-center px-2 py-1 rounded bg-amber-400 text-black text-xs font-bold">Pens wins</span>
                      <span>
                        Every correct explicit pens-winner pick also adds to your
                        <span className="text-foreground font-medium"> Pens Wins </span>
                        tally on the leaderboard.
                      </span>
                    </li>
                  </ul>
                </div>
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
                      <span className="text-foreground font-medium">Most correct knockout-stage picks</span> — accuracy on later, higher-stakes fixtures breaks remaining ties.
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
                title="World Cup 2026 Predictor Winners"
                subtitle="The top 3 will appear automatically once every World Cup 2026 fixture is finished."
                winners={winners}
                competition="wc2026"
                viewerUserId={user?.id ?? null}
                guestSession={guest}
              />
            </TabsContent>
          </Tabs>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <PointsSidebar stats={myStats} loading={loading} joined={joined} />
            <UpcomingFixtures
              fixtures={upcomingFixtures}
              loading={loading}
              canPredict={canPredict}
              onSave={handleSave}
            />
          </aside>
        </div>
      </div>
      </main>
    </div>
    </FixturesFetchedAtContext.Provider>
  );
}

function PointsSidebar({
  stats,
  loading,
  joined,
}: {
  stats: WcLeaderboardRowDTO | null;
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

function UpcomingFixtures({
  fixtures,
  loading,
  canPredict,
  onSave,
}: {
  fixtures: WcFixtureDTO[];
  loading: boolean;
  canPredict: boolean;
  onSave: (
    fixtureId: string,
    hp: number,
    ap: number,
    penWinnerPred?: "home" | "away" | null,
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
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
            const kickoff = t.toLocaleString("en-GB", {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            const lockMs = t.getTime() - 30 * 60 * 1000;
            const locked = Date.now() >= lockMs;
            const hasScore = f.homeScore !== null && f.awayScore !== null;
            const live = isLive(f);
            const finished = isFinished(f);
            const showScore = hasScore && (live || finished);
            return (
              <li key={f.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>
                    {STAGE_LABEL[f.stage]}
                    {f.groupLabel ? ` · ${f.groupLabel}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {live && <LivePill fixture={f} />}
                    <span className="font-mono tabular-nums">{kickoff}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    <span className="mr-1">{teamFlag(f.homeTeam)}</span>
                    {f.homeTeam}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                    {showScore ? (
                      <span className={`font-bold ${live ? "text-red-300" : "text-foreground"}`}>
                        {f.homeScore}–{f.awayScore}
                        {f.penWinner && f.homeScore === f.awayScore && (
                          <span className="ml-1 text-[10px] font-semibold text-emerald-300">
                            (pens {f.homePens ?? "?"}-{f.awayPens ?? "?"})
                          </span>
                        )}
                      </span>
                    ) : locked ? (
                      <Lock className="size-3" />
                    ) : f.myPrediction ? (
                      <span className="font-bold text-primary tabular-nums" title="Your prediction">
                        {f.myPrediction.homePred}–{f.myPrediction.awayPred}
                      </span>
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
                      {f.myPrediction.penWinnerPred && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold uppercase tracking-wide">
                          Pens: {f.myPrediction.penWinnerPred === "home" ? f.homeTeam : f.awayTeam}
                        </span>
                      )}
                    </span>
                    {finished && f.myPrediction.points !== null && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold tabular-nums uppercase tracking-wide">
                        +{f.myPrediction.points} pt
                        {f.myPrediction.points === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}
                {!locked && !finished && (
                  <SidebarPickInput
                    fixture={f}
                    canPredict={canPredict}
                    onSave={onSave}
                  />
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

function SidebarPickInput({
  fixture,
  canPredict,
  onSave,
}: {
  fixture: WcFixtureDTO;
  canPredict: boolean;
  onSave: (
    fixtureId: string,
    hp: number,
    ap: number,
    penWinnerPred?: "home" | "away" | null,
  ) => Promise<void>;
}) {
  const [hp, setHp] = useState<string>(fixture.myPrediction?.homePred?.toString() ?? "");
  const [ap, setAp] = useState<string>(fixture.myPrediction?.awayPred?.toString() ?? "");
  const [penPick, setPenPick] = useState<"home" | "away" | null>(
    fixture.myPrediction?.penWinnerPred ?? null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHp(fixture.myPrediction?.homePred?.toString() ?? "");
    setAp(fixture.myPrediction?.awayPred?.toString() ?? "");
    setPenPick(fixture.myPrediction?.penWinnerPred ?? null);
  }, [
    fixture.myPrediction?.homePred,
    fixture.myPrediction?.awayPred,
    fixture.myPrediction?.penWinnerPred,
  ]);

  const valid =
    hp !== "" && ap !== "" && Number.isInteger(Number(hp)) && Number.isInteger(Number(ap)) &&
    Number(hp) >= 0 && Number(ap) >= 0;
  const isKnockout = fixture.stage !== "group";
  const numericDraw = valid && Number(hp) === Number(ap);
  const showPenPicker = isKnockout && numericDraw && canPredict;
  const dirty =
    valid &&
    (Number(hp) !== fixture.myPrediction?.homePred ||
      Number(ap) !== fixture.myPrediction?.awayPred ||
      (numericDraw && penPick !== (fixture.myPrediction?.penWinnerPred ?? null)));

  const submit = async () => {
    if (!valid || !dirty) return;
    setBusy(true);
    try {
      await onSave(fixture.id, Number(hp), Number(ap), numericDraw ? penPick : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        disabled={!canPredict || busy}
        className="h-7 w-12 px-1.5 text-center text-sm tabular-nums"
        aria-label="Home score"
      />
      <span className="text-xs text-muted-foreground">–</span>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={ap}
        onChange={(e) => setAp(e.target.value)}
        disabled={!canPredict || busy}
        className="h-7 w-12 px-1.5 text-center text-sm tabular-nums"
        aria-label="Away score"
      />
      <Button
        size="sm"
        onClick={submit}
        disabled={!canPredict || !dirty || busy}
        className="ml-auto h-7 px-2 text-[11px]"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : fixture.myPrediction ? "Update" : "Save"}
      </Button>
      </div>
      {showPenPicker && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            Pick the pens winner
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(["home", "away"] as const).map((side) => {
              const teamName = side === "home" ? fixture.homeTeam : fixture.awayTeam;
              const selected = penPick === side;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPenPick(selected ? null : side)}
                  disabled={!canPredict || busy}
                  className={`rounded px-2 py-1 text-[11px] font-semibold border transition truncate ${
                    selected
                      ? "bg-emerald-500 text-black border-emerald-500"
                      : "border-border bg-surface-1 hover:bg-surface-2"
                  }`}
                  aria-pressed={selected}
                >
                  {teamFlag(teamName)} {teamName}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FixturesList({
  fixtures,
  canPredict,
  onSave,
  mode = "upcoming",
}: {
  fixtures: WcFixtureDTO[];
  canPredict: boolean;
  onSave: (
    fixtureId: string,
    hp: number,
    ap: number,
    penWinnerPred?: "home" | "away" | null,
  ) => Promise<void>;
  mode?: "upcoming" | "completed";
}) {
  const defaultFilter = useMemo<string>(() => {
    const now = Date.now();
    if (!fixtures.length) return "A";
    const keyOf = (f: WcFixtureDTO) =>
      f.stage === "group" ? (f.groupLabel ?? "") : f.stage;
    // 1) A fixture currently live
    const live = fixtures.find((f) => {
      const s = f.status ?? "";
      return s === "IN_PLAY" || s === "PAUSED" || s === "LIVE";
    });
    if (live) return keyOf(live) || "A";
    // 2) The stage currently in progress — one with both finished AND
    //    not-finished fixtures. Prefer later stages (knockout over group),
    //    and within a stage pick the key whose next unfinished fixture is
    //    soonest. This makes the page land on e.g. R32 while it's being
    //    played, even if today's earlier R32 kick-offs are already in the
    //    past.
    const stageOrder = ["group", "r32", "r16", "qf", "sf", "third", "final"];
    for (let i = stageOrder.length - 1; i >= 0; i--) {
      const stage = stageOrder[i] as WcFixtureDTO["stage"];
      const inStage = fixtures.filter((f) => f.stage === stage);
      if (!inStage.length) continue;
      const hasFinished = inStage.some((f) => (f.status ?? "") === "FINISHED");
      const unfinished = inStage
        .filter((f) => (f.status ?? "") !== "FINISHED")
        .sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt));
      if (hasFinished && unfinished.length) {
        return keyOf(unfinished[0]) || "A";
      }
    }
    // 3) Otherwise the next upcoming fixture across all stages.
    const upcoming = fixtures
      .filter((f) => (f.status ?? "") !== "FINISHED" && new Date(f.kickoffAt).getTime() >= now)
      .sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt))[0];
    if (upcoming) return keyOf(upcoming) || "A";
    // 4) Most recent fixture (everything finished)
    const latest = [...fixtures].sort(
      (a, b) => +new Date(b.kickoffAt) - +new Date(a.kickoffAt),
    )[0];
    return (latest && keyOf(latest)) || "A";
  }, [fixtures]);
  const [filter, setFilter] = useState<string>(defaultFilter); // "A".."L" | "r32"…"final"
  const didInitFilter = useRef(false);
  useEffect(() => {
    if (didInitFilter.current) return;
    if (fixtures.length === 0) return;
    didInitFilter.current = true;
    setFilter(defaultFilter);
  }, [fixtures.length, defaultFilter]);

  const filtered = useMemo(() => {
    if (["r32", "r16", "qf", "sf", "third", "final"].includes(filter)) {
      return fixtures.filter((f) => f.stage === filter);
    }
    return fixtures.filter((f) => f.stage === "group" && f.groupLabel === filter);
  }, [fixtures, filter]);

  // group by date (YYYY-MM-DD)
  // group by date (YYYY-MM-DD), with finished fixtures pushed to the bottom
  const { byDate, byDateFinished } = useMemo(() => {
    const active = new Map<string, WcFixtureDTO[]>();
    const finished = new Map<string, WcFixtureDTO[]>();
    const sorted = [...filtered].sort(
      (a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt),
    );
    for (const f of sorted) {
      const d = new Date(f.kickoffAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
      const target = isFinished(f) ? finished : active;
      if (!target.has(d)) target.set(d, []);
      target.get(d)!.push(f);
    }
    return { byDate: active, byDateFinished: finished };
  }, [filtered]);

  if (!fixtures.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
        {mode === "completed"
          ? "No completed matches yet."
          : "No fixtures yet. An owner can add them from the owner panel."}
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
  const hotCounts = useMemo(() => {
    const now = Date.now();
    const soon = now + 24 * 60 * 60 * 1000;
    const counts = new Map<string, { live: number; soon: number }>();
    for (const f of fixtures) {
      const s = f.status ?? "";
      const live = s === "IN_PLAY" || s === "PAUSED" || s === "LIVE";
      const t = new Date(f.kickoffAt).getTime();
      const upcomingSoon = !live && s !== "FINISHED" && t >= now && t < soon;
      if (!live && !upcomingSoon) continue;
      const key = f.stage === "group" ? (f.groupLabel ?? "") : f.stage;
      if (!key) continue;
      const c = counts.get(key) ?? { live: 0, soon: 0 };
      if (live) c.live += 1;
      else c.soon += 1;
      counts.set(key, c);
    }
    return counts;
  }, [fixtures]);
  const chip = (key: string, label: string) => {
    const c = hotCounts.get(key);
    const hot = !!c;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition ${
          filter === key
            ? "bg-primary text-primary-foreground border-primary shadow-glow"
            : "bg-surface-1 text-muted-foreground border-border hover:text-foreground"
        } ${hot ? "animate-pulse" : ""}`}
      >
        <span>{label}</span>
        {c && c.live > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
            title={`${c.live} live now`}
          >
            <span className="size-1.5 rounded-full bg-white animate-pulse" />
            LIVE {c.live}
          </span>
        )}
        {c && c.soon > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-red-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-[0_0_8px_rgba(239,68,68,0.7)]"
            title={`${c.soon} kicking off in the next 24h`}
          >
            SOON {c.soon}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-primary/60 bg-surface-1 p-3 shadow-md shadow-primary/10 space-y-3">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
            Group Games
          </h3>
          <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
            {groupLetters.map((g) => chip(g, `Group ${g}`))}
          </div>
        </div>
        <div className="border-t border-border/60 pt-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
            Knock-out Games
          </h3>
          <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
            {koRounds.map((r) => chip(r.key, r.label))}
          </div>
        </div>
      </div>
      {mode === "upcoming" && byDate.size === 0 && (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          No fixtures in this view yet.
        </div>
      )}
      {mode === "completed" && byDateFinished.size === 0 && (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          No completed matches in this view yet.
        </div>
      )}
      {mode === "upcoming" && [...byDate.entries()].map(([date, items]) => (
        <div key={date}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-2 px-2 py-1.5 rounded-md bg-surface-2 border-l-4 border-primary">
            {date}
          </h2>
          <div className="grid gap-3">
            {items.map((f) => (
              <FixtureCard key={f.id} fixture={f} canPredict={canPredict} onSave={onSave} />
            ))}
          </div>
        </div>
      ))}
      {mode === "completed" && byDateFinished.size > 0 && (
        <div className="space-y-4 pt-2">
          {[...byDateFinished.entries()].map(([date, items]) => (
            <div key={`done-${date}`}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-2 px-2 py-1.5 rounded-md bg-surface-2 border-l-4 border-primary">
                {date}
              </h3>
              <div className="grid gap-3">
                {items.map((f) => (
                  <FixtureCard key={f.id} fixture={f} canPredict={canPredict} onSave={onSave} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GuestLoginCard({
  busy,
  initialMode = "register",
  onSubmit,
  onSignInExisting,
  onCancel,
  onRequestReset,
  onResetPin,
}: {
  busy: boolean;
  initialMode?: "signin" | "register";
  onSubmit: (email: string, pin: string, displayName: string) => void;
  onSignInExisting: (email: string, pin: string) => void;
  onCancel: () => void;
  onRequestReset: (email: string) => Promise<void>;
  onResetPin: (email: string, code: string, newPin: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"signin" | "register" | "reset-request" | "reset-verify">(
    initialMode,
  );
  const [resetCode, setResetCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetting, setResetting] = useState(false);

  const registerValid =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    /^\d{4}$/.test(pin) &&
    displayName.trim().length >= 1;
  const signinValid =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && /^\d{4}$/.test(pin);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const resetValid = emailValid && /^\d{6}$/.test(resetCode) && /^\d{4}$/.test(newPin);

  if (mode === "reset-request" || mode === "reset-verify") {
    return (
      <div className="mb-6 rounded-2xl border-2 border-primary/80 bg-surface p-5 shadow-soft backdrop-blur-md">
        <h3 className="font-display text-xl font-bold mb-1 text-foreground drop-shadow">Reset your PIN</h3>
        <p className="text-sm text-foreground/90 mb-4">
          {mode === "reset-request"
            ? "Enter your email and we'll send a 6-digit reset code."
            : "Enter the 6-digit code from your email and choose a new 4-digit PIN."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
              Email
            </label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              disabled={resetting || mode === "reset-verify"}
              autoComplete="email"
            />
          </div>
          {mode === "reset-verify" && (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
                  Reset code
                </label>
                <Input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  disabled={resetting}
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
                  New 4-digit PIN
                </label>
                <Input
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="••••"
                  disabled={resetting}
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              setMode(initialMode);
              setResetCode("");
              setNewPin("");
            }}
            disabled={resetting}
          >
            Back to sign in
          </Button>
          {mode === "reset-request" ? (
            <Button
              onClick={async () => {
                setResetting(true);
                try {
                  await onRequestReset(email.trim().toLowerCase());
                  setMode("reset-verify");
                } finally {
                  setResetting(false);
                }
              }}
              disabled={!emailValid || resetting}
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : "Send reset code"}
            </Button>
          ) : (
            <Button
              onClick={async () => {
                setResetting(true);
                try {
                  await onResetPin(email.trim().toLowerCase(), resetCode, newPin);
                } finally {
                  setResetting(false);
                }
              }}
              disabled={!resetValid || resetting}
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : "Reset PIN & sign in"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border-2 border-primary/80 bg-surface p-5 shadow-soft backdrop-blur-md">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-xl font-bold text-foreground drop-shadow">
          {mode === "signin" ? "Guest sign in" : "Register as guest"}
        </h3>
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => setMode(mode === "signin" ? "register" : "signin")}
          disabled={busy}
        >
          {mode === "signin" ? "New here? Register" : "Already registered? Sign in"}
        </button>
      </div>
      <p className="text-sm text-foreground/90 mb-4">
        {mode === "signin"
          ? "Enter the email and 4-digit PIN you used when you registered."
          : "Pick a display name, enter your email, and choose a 4-digit PIN. Use the same email + PIN later to edit your picks."}
      </p>
      <div className={`grid grid-cols-1 gap-3 ${mode === "signin" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {mode === "register" && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
            Display name
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            placeholder="e.g. Sarah B"
            disabled={busy}
          />
        </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
            Email
          </label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            disabled={busy}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground text-glow">
            4-digit PIN
          </label>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="••••"
            disabled={busy}
            autoComplete="one-time-code"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="ghost"
          onClick={() => setMode("reset-request")}
          disabled={busy}
          type="button"
        >
          Forgot PIN?
        </Button>
        {mode === "signin" ? (
          <Button
            onClick={() => onSignInExisting(email.trim().toLowerCase(), pin)}
            disabled={!signinValid || busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        ) : (
          <Button
            onClick={() => onSubmit(email.trim().toLowerCase(), pin, displayName.trim())}
            disabled={!registerValid || busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Register & continue"}
          </Button>
        )}
      </div>
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
  onSave: (
    fixtureId: string,
    hp: number,
    ap: number,
    penWinnerPred?: "home" | "away" | null,
  ) => Promise<void>;
}) {
  const kickoffMs = new Date(fixture.kickoffAt).getTime();
  const LOCK_MS = 30 * 60 * 1000;
  const lockAtMs = kickoffMs - LOCK_MS;
  const locked = Date.now() >= lockAtMs;
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const live = isLive(fixture);
  // Only treat a fixture as finished when the feed says so — a stale score on a
  // TIMED fixture must not be rendered as "Final".
  const finished = isFinished(fixture);
  const scored = finished && hasScore;
  const upcomingSoon = !live && !finished && kickoffMs - Date.now() <= 24 * 60 * 60 * 1000 && kickoffMs - Date.now() > 0;
  const [hp, setHp] = useState<string>(fixture.myPrediction?.homePred?.toString() ?? "");
  const [ap, setAp] = useState<string>(fixture.myPrediction?.awayPred?.toString() ?? "");
  const [penPick, setPenPick] = useState<"home" | "away" | null>(
    fixture.myPrediction?.penWinnerPred ?? null,
  );
  const [busy, setBusy] = useState(false);
  const hasPick = !!fixture.myPrediction;
  // When user already has a saved pick, hide inputs behind an Edit button.
  const [editing, setEditing] = useState<boolean>(!hasPick);
  const showInputs = !locked && !scored && (editing || !hasPick);

  const isKnockout = fixture.stage !== "group";
  const numericDraw =
    hp !== "" && ap !== "" && Number(hp) === Number(ap);
  const showPenPicker = isKnockout && showInputs && numericDraw && canPredict;

  const dirty =
    !locked &&
    canPredict &&
    hp !== "" &&
    ap !== "" &&
    (Number(hp) !== fixture.myPrediction?.homePred ||
      Number(ap) !== fixture.myPrediction?.awayPred ||
      (numericDraw && penPick !== (fixture.myPrediction?.penWinnerPred ?? null)));

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await onSave(fixture.id, Number(hp), Number(ap), numericDraw ? penPick : null);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setHp(fixture.myPrediction?.homePred?.toString() ?? "");
    setAp(fixture.myPrediction?.awayPred?.toString() ?? "");
    setPenPick(fixture.myPrediction?.penWinnerPred ?? null);
    setEditing(false);
  };

  return (
    <div
      className={`min-w-0 rounded-2xl border-2 bg-surface-1 p-3 sm:p-4 shadow-md ${
        live
          ? "border-emerald-500/80 shadow-emerald-500/30 animate-pulse"
          : upcomingSoon
            ? "border-red-500/80 shadow-red-500/30 animate-pulse"
            : "border-primary/60 shadow-primary/10"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground mb-3">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          {STAGE_LABEL[fixture.stage]}
          {fixture.groupLabel && (
            <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">
              Group {fixture.groupLabel}
            </span>
          )}
        </span>
        <span className="inline-flex flex-wrap items-center gap-2">
          {live && <LivePill fixture={fixture} />}
          {!locked && !scored && <LockCountdownPill lockAtMs={lockAtMs} />}
          <span className="font-bold text-foreground tabular-nums">
            {formatKickoff(fixture.kickoffAt)}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <div className="min-w-0 break-words text-right font-medium">
          <span className="mr-1.5">{teamFlag(fixture.homeTeam)}</span>
          {fixture.homeTeam}
          {fixture.homeReds > 0 && <span className="ml-1.5"><RedCards count={fixture.homeReds} /></span>}
        </div>
        {live && hasScore ? (
          <div className="text-center">
            <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 font-display text-lg font-bold tabular-nums text-red-300">
              {fixture.homeScore} – {fixture.awayScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-red-300/80 mt-1 inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-red-400 animate-pulse" /> <LiveMinuteText fixture={fixture} />
            </div>
          </div>
        ) : scored ? (
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
        <div className="min-w-0 break-words font-medium">
          {fixture.awayTeam}
          <span className="ml-1.5">{teamFlag(fixture.awayTeam)}</span>
          {fixture.awayReds > 0 && <span className="ml-1.5"><RedCards count={fixture.awayReds} /></span>}
        </div>
      </div>

      {showPenPicker && (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">
            Knockout — pick the pens winner
          </div>
          <p className="text-[11px] text-muted-foreground">
            You&apos;ve predicted a draw. If the match is decided on penalties,
            you&apos;ll get +1 bonus for picking the right team to win the shootout.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["home", "away"] as const).map((side) => {
              const teamName = side === "home" ? fixture.homeTeam : fixture.awayTeam;
              const selected = penPick === side;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPenPick(selected ? null : side)}
                  className={`rounded px-2 py-1.5 text-xs font-semibold border transition ${
                    selected
                      ? "bg-emerald-500 text-black border-emerald-500"
                      : "border-border bg-surface-1 hover:bg-surface-2"
                  }`}
                  aria-pressed={selected}
                >
                  {teamFlag(teamName)} {teamName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="text-muted-foreground">
          {fixture.myPrediction ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5 text-emerald-400" />
              Your pick:{" "}
              <span className="font-mono text-foreground">
                {fixture.myPrediction.homePred} – {fixture.myPrediction.awayPred}
              </span>
              {fixture.myPrediction.penWinnerPred && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold uppercase tracking-wide">
                  Pens: {fixture.myPrediction.penWinnerPred === "home" ? fixture.homeTeam : fixture.awayTeam}
                </span>
              )}
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
        <span className="uppercase tracking-wider text-muted-foreground">
          {live ? "Game in play" : "Final score"}
        </span>
        {live && hasScore ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-bold tabular-nums">
            <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
            {fixture.homeScore} – {fixture.awayScore} · <LiveMinuteText fixture={fixture} />
          </span>
        ) : scored ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold tabular-nums">
            <Check className="size-3" />
            {fixture.homeScore} – {fixture.awayScore}
            {fixture.penWinner && fixture.homeScore === fixture.awayScore && (
              <span className="ml-1 normal-case tracking-normal text-emerald-200/90 font-semibold">
                (Pens {fixture.homePens ?? "?"}-{fixture.awayPens ?? "?"},{" "}
                {fixture.penWinner === "home" ? fixture.homeTeam : fixture.awayTeam})
              </span>
            )}
          </span>
        ) : fixture.myPrediction ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-bold tabular-nums uppercase tracking-wide">
            <Check className="size-3" />
            Your prediction: {fixture.myPrediction.homePred} – {fixture.myPrediction.awayPred}
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
  canManage,
  onChanged,
}: {
  rows: WcLeaderboardRowDTO[];
  currentUserId: string | null;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const OWNER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";
  const owner = rows.find((r) => r.userId === OWNER_ID) ?? null;
  const ranked = rows.filter((r) => r.userId !== OWNER_ID);
  const [openEntrant, setOpenEntrant] = useState<WcLeaderboardRowDTO | null>(null);
  const [picks, setPicks] = useState<WcEntrantPickDTO[] | null>(null);
  const [picksLoading, setPicksLoading] = useState(false);
  const fetchPicks = useServerFn(getEntrantWcPredictions);
  const deleteEntrantFn = useServerFn(adminDeleteWcEntrant);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WcLeaderboardRowDTO | null>(null);
  const handleDeleteEntrant = async (r: WcLeaderboardRowDTO) => {
    setDeletingId(r.userId);
    try {
      await deleteEntrantFn({ data: { entrantId: r.userId, isGuest: r.isGuest } });
      toast.success("Entrant removed");
      setConfirmDelete(null);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete entrant");
    } finally {
      setDeletingId(null);
    }
  };
  useEffect(() => {
    if (!openEntrant) {
      setPicks(null);
      return;
    }
    setPicksLoading(true);
    setPicks(null);
    fetchPicks({ data: { entrantId: openEntrant.userId, isGuest: openEntrant.isGuest } })
      .then((rs) => setPicks(rs))
      .catch((e: any) => toast.error(e?.message ?? "Failed to load picks"))
      .finally(() => setPicksLoading(false));
  }, [openEntrant, fetchPicks]);
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
        No predictions yet — be the first to enter.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="grid grid-cols-[16px_minmax(0,1fr)_24px_22px_24px_22px_22px_28px_36px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_112px_64px_80px] gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2 border-b border-border [&>div]:whitespace-nowrap">
        <div>#</div>
        <div>Player</div>
        <div className="text-center"><span className="sm:hidden">P</span><span className="hidden sm:inline">Predictions Entered</span></div>
        <div className="text-center" title="Correct score (exact)"><span className="sm:hidden">CS</span><span className="hidden sm:inline">Correct Score</span></div>
        <div className="text-center" title="Right winning margin (3 pts)"><span className="sm:hidden">WM</span><span className="hidden sm:inline">Winning Margin</span></div>
        <div className="text-center" title="Correct result"><span className="sm:hidden">R</span><span className="hidden sm:inline">Correct Result</span></div>
        <div className="text-center" title="Correct explicit penalty shootout winner picks (1 pt)"><span className="sm:hidden">PW</span><span className="hidden sm:inline">Pen Wins</span></div>
        <div className="text-center"><span className="sm:hidden">Pt</span><span className="hidden sm:inline">Points</span></div>
        <div className="text-center">Type</div>
      </div>
      <ul>
        {ranked.map((r, i) => {
          const rank = i + 1;
          const mine = r.userId === currentUserId;
          return (
            <li
              key={r.userId}
              className={`grid grid-cols-[16px_minmax(0,1fr)_24px_22px_24px_22px_22px_28px_36px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_112px_64px_80px] gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-2.5 text-xs sm:text-sm border-b border-border last:border-b-0 ${
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
                    className="hidden sm:block size-7 rounded-full object-cover bg-surface-2"
                  />
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
                    {mine && (
                      <span className="ml-2 text-[10px] uppercase text-primary">you</span>
                    )}
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
                    {deletingId === r.userId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                )}
              </div>
              <div className="text-center tabular-nums">{r.predictionsMade}</div>
              <div className="tabular-nums flex items-center justify-center gap-1">
                <Star className="size-3 text-yellow-400 hidden sm:block" /> {r.exactCount}
              </div>
              <div className="text-center tabular-nums text-muted-foreground">{r.goalDiffCount}</div>
              <div className="text-center tabular-nums">{r.resultCount}</div>
              <div className="text-center tabular-nums text-muted-foreground">{r.penWinCount}</div>
              <div className="text-center font-display font-bold tabular-nums">
                {r.totalPoints}
              </div>
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
            className={`grid grid-cols-[16px_minmax(0,1fr)_24px_22px_24px_22px_22px_28px_36px] sm:grid-cols-[36px_minmax(0,0.6fr)_140px_112px_160px_112px_112px_64px_80px] gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-2.5 text-xs sm:text-sm ${
              owner.userId === currentUserId ? "bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center text-muted-foreground">—</div>
            <div className="flex items-center gap-2 min-w-0">
              {owner.avatarUrl ? (
                <img
                  src={owner.avatarUrl}
                  alt=""
                  className="hidden sm:block size-7 rounded-full object-cover bg-surface-2"
                />
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
            <div className="text-center tabular-nums text-muted-foreground">{owner.penWinCount}</div>
            <div className="text-center font-display font-bold tabular-nums">
              {owner.totalPoints}
            </div>
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
          {(() => {
            const kickedOffPicks = picks ?? [];
            return picksLoading ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : kickedOffPicks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No matches have kicked off yet — picks reveal once kick-off passes.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {kickedOffPicks.map((p) => {
                const finished = p.status === "FINISHED" && p.homeScore !== null && p.awayScore !== null;
                const live = isLive(p);
                return (
                  <li key={p.fixtureId} className="py-2.5 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">
                        {p.homeTeam} <span className="text-muted-foreground">vs</span> {p.awayTeam}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(p.kickoffAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {finished && (
                          <span className="ml-2 font-mono text-foreground">
                            FT {p.homeScore}-{p.awayScore}
                            {p.penWinner && p.homeScore === p.awayScore && (
                              <span className="ml-1 text-muted-foreground">
                                (Pens {p.homePens ?? "?"}-{p.awayPens ?? "?"}, {p.penWinner === "home" ? p.homeTeam : p.awayTeam})
                              </span>
                            )}
                          </span>
                        )}
                        {!finished && live && (
                          <span className="ml-2 font-mono text-red-300">
                            LIVE <LiveMinuteText fixture={p} />{scoreLabel(p) ? ` ${scoreLabel(p)}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-foreground">
                      {p.homePred}-{p.awayPred}
                    </div>
                    {p.penWinnerPred && p.homePred === p.awayPred && (
                      <div
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          p.penWinner && p.penWinner === p.penWinnerPred
                            ? "bg-emerald-500/20 text-emerald-300"
                            : p.penWinner
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                        title="Pens winner pick"
                      >
                        Pens: {p.penWinnerPred === "home" ? p.homeTeam : p.awayTeam}
                      </div>
                    )}
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
          );
          })()}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o && !deletingId) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entrant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-semibold text-foreground">
                {confirmDelete?.displayName || confirmDelete?.username || "this entrant"}
              </span>{" "}
              {confirmDelete?.isGuest ? "(guest)" : "(site user)"} and all of their predictions
              from the leaderboard. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingId}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) handleDeleteEntrant(confirmDelete);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingId ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Deleting…
                </span>
              ) : (
                "Delete entrant"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const groupLetters = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const koRounds: { key: string; label: string }[] = [
    { key: "r32", label: "Round of 32" },
    { key: "r16", label: "Round of 16" },
    { key: "qf", label: "Quarter-finals" },
    { key: "sf", label: "Semi-finals" },
    { key: "third", label: "Third Place" },
    { key: "final", label: "Final" },
  ];
  // Pick a sensible default chip: first group/stage that actually has picks.
  const availableKeys = new Set<string>();
  for (const f of fixtures) {
    availableKeys.add(f.stage === "group" ? (f.groupLabel ?? "") : f.stage);
  }
  const defaultKey =
    groupLetters.find((g) => availableKeys.has(g)) ??
    koRounds.map((r) => r.key).find((k) => availableKeys.has(k)) ??
    "A";
  const [filter, setFilter] = useState<string>(defaultKey);
  const filtered = useMemo(() => {
    const ko = ["r32", "r16", "qf", "sf", "third", "final"];
    const list = ko.includes(filter)
      ? fixtures.filter((f) => f.stage === filter)
      : fixtures.filter((f) => f.stage === "group" && f.groupLabel === filter);
    return list.sort((a, b) => +new Date(a.kickoffAt) - +new Date(b.kickoffAt));
  }, [fixtures, filter]);
  const chip = (key: string, label: string) => {
    const has = availableKeys.has(key);
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        disabled={!has}
        className={`shrink-0 inline-flex items-center px-3 h-8 rounded-full text-xs font-medium border transition ${
          filter === key
            ? "bg-primary text-primary-foreground border-primary shadow-glow"
            : "bg-surface-1 text-muted-foreground border-border hover:text-foreground"
        } ${!has ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-primary/60 bg-surface-1 p-3 shadow-md shadow-primary/10 space-y-3">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
            Group Games
          </h3>
          <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
            {groupLetters.map((g) => chip(g, `Group ${g}`))}
          </div>
        </div>
        <div className="border-t border-border/60 pt-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
            Knock-out Games
          </h3>
          <div className="-mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
            {koRounds.map((r) => chip(r.key, r.label))}
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          No picks in this stage yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
        <div key={f.id} className="rounded-2xl border-2 border-primary/60 bg-surface-1 shadow-md shadow-primary/10 px-4 py-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
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
      )}
    </div>
  );
}
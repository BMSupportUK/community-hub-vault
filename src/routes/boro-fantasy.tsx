import { createFileRoute, Link } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shirt, Loader2, Lock, LogOut, Crown, Star, ArrowRightLeft, Trophy,
  Users, Plus, X, ArrowUp, ArrowDown, ClipboardList, Check, Pencil, Trash2,
  Cross, AlertTriangle, Ban, ArrowLeft,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { WinnersTab } from "@/components/app/WinnersTab";
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";
import { IconRail } from "@/components/app/IconRail";
import { useAuth } from "@/hooks/use-auth";
import {
  benchRulesFor, COMPETITION_BENCH_RULES, FORMATION_KEYS, POSITION_ORDER,
  POSITION_SHORT, POSITION_LABEL, SCORING_RULES, SQUAD_RULES,
  FORMATIONS, formationCounts, formationRows, formationPositionRange, rowPositions, slotPositionLabel,
  playerPositions, playerPositionLabel, xiFitsFormation, resolveSlotPosition,
  fantasyCompetitionGroup, FANTASY_GROUP_LABEL,
  FANTASY_BENCH_SIZE, FANTASY_SQUAD_SIZE, FANTASY_LOCK_MINUTES,
  PLAYER_STAT_META, statPointsPer, isOurScoringStat,
  type FantasyPosition, type FormationKey, type FantasyCompetitionGroup,
} from "@/lib/fantasy-rules";
import {
  getFantasyState, getFantasyLeaderboard, getFantasyPreviousGameweekScores, joinFantasyGame, saveFantasySquad, setFantasyTeamName,
  adminRemoveFantasyEntrant,
  getFantasyPlayerBreakdown,
  getFantasySwapHistory,
  adminSetFantasyGameweekStatus,
  type FantasyStateDTO, type FantasyPlayerDTO, type FantasyLeaderboardRow, type FantasyGameweekDTO,
  type FantasyPlayerBreakdown, type FantasyPreviousGwScoreDTO, type FantasySwapHistoryRow,
} from "@/lib/fantasy.functions";
import {
  getEntrantFantasySquad, type EntrantSquadViewDTO,
} from "@/lib/fantasy-squad-view.functions";
import {
  fantasyGuestRegister, fantasyGuestSignInExisting, getPublicFantasyState,
  getPublicFantasyLeaderboard, getPublicFantasyPreviousGameweekScores, saveGuestFantasySquad, requestFantasyGuestPinReset,
  resetFantasyGuestPin, setGuestFantasyTeamName,
  getGuestFantasySwapHistory,
} from "@/lib/fantasy-guest.functions";
import fantasyBossAsset from "@/assets/fantasy-boss.jpg.asset.json";


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
  component: FantasyPageWithStats,
});

// ------------------------------------------------------------------
// Player stats pop-up: tap any player's name to see their per-match
// ESPN stat lines and the points those stats earned.
// ------------------------------------------------------------------
const PlayerStatsCtx = createContext<
  (playerId: string, scoringAs?: FantasyPosition | null, asSub?: boolean, gameweekNumber?: number | null) => void
>(
  () => {},
);

/** 0-10 match rating pill shown beside a player's name on the pitch. */
function RatingPill({ rating, dark = false }: { rating?: number | null; dark?: boolean }) {
  if (rating == null || rating <= 0) return null;
  const tone =
    rating >= 7.5
      ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-200"
      : rating >= 6
        ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
        : "border-rose-400/60 bg-rose-500/20 text-rose-200";
  const light =
    rating >= 7.5
      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
      : rating >= 6
        ? "border-amber-500/50 bg-amber-500/15 text-amber-500"
        : "border-rose-500/50 bg-rose-500/15 text-rose-500";
  return (
    <span
      title={`Match rating ${rating.toFixed(1)} / 10`}
      className={`inline-flex items-center rounded-full border px-1 text-[9px] font-black tabular-nums leading-tight ${dark ? tone : light}`}
    >
      {rating.toFixed(1)}
    </span>
  );
}

/** Clickable player name that opens the stats pop-up. */
function PlayerNameButton({
  playerId,
  name,
  className = "",
  scoringAs = null,
  asSub = false,
  gameweekNumber = null,
}: {
  playerId: string;
  name: string;
  className?: string;
  /** Position this player was selected to score in, when he covers more than one. */
  scoringAs?: FantasyPosition | null;
  /** True when the player is named on the bench — subs earn half points. */
  asSub?: boolean;
  /** The squad gameweek whose points should be shown in the weekly section. */
  gameweekNumber?: number | null;
}) {
  const open = useContext(PlayerStatsCtx);
  return (
    <button
      type="button"
      title={`${name} — view stats and points`}
      onClick={(e) => { e.stopPropagation(); open(playerId, scoringAs, asSub, gameweekNumber); }}
      className={`w-full text-center underline-offset-2 hover:underline ${className}`}
    >
      {name}
    </button>
  );
}

/** ESPN-style abbreviation + plain-English label for every stat we read. */
const PLAYER_STAT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PLAYER_STAT_META).map(([k, m]) => [k, `${m.abbr} — ${m.means}`]),
);
const STAT_KEYS_ALL = Object.keys(PLAYER_STAT_META);

/** Only the stats we actually score points on for this position (minutes kept for context). */
function scoringStatKeys(pos: FantasyPosition) {
  return STAT_KEYS_ALL.filter((k) => k === "minutes" || statPointsPer(k, pos) != null);
}

/** Small purple abbreviation chip, ESPN style. */
function AbbrChip({ abbr, title }: { abbr: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-purple-400"
    >
      {abbr}
    </span>
  );
}

function formatPointRate(rate: number | null): string {
  if (rate == null) return "";
  if (rate === 1) return "1 pt";
  if (rate === -1) return "−1 pt";
  return `${rate} pts`;
}

/** Abbreviation chip plus the point value it earns for the selected role. */
function StatAbbrLabel({
  abbr,
  means,
  rate,
}: {
  abbr: string;
  means: string;
  rate?: number | null;
}) {
  const pts = formatPointRate(rate ?? null);
  return (
    <span className="flex items-center gap-1.5">
      <AbbrChip abbr={abbr} title={means} />
      {pts && <span className="text-[10px] font-semibold text-emerald-500">{pts}</span>}
    </span>
  );
}

function PlayerStatsDialog({
  playerId,
  scoringAs,
  asSub = false,
  gameweekNumber = null,
  onClose,
}: {
  playerId: string | null;
  /** Overrides the player's default position when he's been picked in another role. */
  scoringAs?: FantasyPosition | null;
  /** Named on the bench — every scoring line is worth half. */
  asSub?: boolean;
  /** Only this selected gameweek belongs in the weekly points table. */
  gameweekNumber?: number | null;
  onClose: () => void;
}) {
  const fn = useServerFn(getFantasyPlayerBreakdown);
  const query = useQuery<FantasyPlayerBreakdown>({
    queryKey: ["fantasy-player-breakdown", playerId],
    queryFn: () => fn({ data: { playerId: playerId! } }),
    enabled: !!playerId,
  });
  const data = query.data;
  const matches = data?.matches ?? [];
  const gameweekMatches = useMemo(
    () => gameweekNumber == null ? matches.slice(0, 1) : matches.filter((match) => match.gwNumber === gameweekNumber),
    [matches, gameweekNumber],
  );
  const pos = (scoringAs ?? (data?.position || "mid")) as FantasyPosition;
  const picked = !!scoringAs && scoringAs !== (data?.position as FantasyPosition | undefined);
  /** Subs score half of every line — apply it to every rate we display. */
  const rateMul = asSub ? 0.5 : 1;
  const scaleRate = (r: number | null) => (r == null ? null : Math.round(r * rateMul * 100) / 100);
  /** ESPN match-centre stats that score for this role, shown in the ESPN tab. */
  const statKeys = useMemo(
    () => scoringStatKeys(pos).filter((k) => !isOurScoringStat(k) || k === "minutes"),
    [pos],
  );
  /** Selected gameweek totals per stat, with the points each one is worth. */
  const seasonRows = useMemo(
    () =>
      scoringStatKeys(pos).map((k) => {
        const total = gameweekMatches.reduce((s, m) => s + (m.stats[k] ?? 0), 0);
        const rate = scaleRate(statPointsPer(k, pos));
        return {
          key: k,
          abbr: PLAYER_STAT_META[k]!.abbr,
          means: PLAYER_STAT_META[k]!.means,
          total,
          rate,
          points: rate == null ? null : Math.round(total * rate * 100) / 100,
        };
      }),
    [gameweekMatches, pos, rateMul],
  );
  /**
   * "Our points" lines. Minutes on their own score nothing — what we actually
   * award is the appearance: 2 pts for a starter who features, 1 pt for a sub
   * who comes off the bench. Show that instead of a blank MIN row.
   */
  const ourRows = useMemo(() => {
    const rows = seasonRows.filter((r) => isOurScoringStat(r.key) && r.key !== "minutes");
    const apps = gameweekMatches.filter((m) => (m.stats.minutes ?? 0) > 0).length;
    const appRate = asSub ? 1 : 2;
    // Star player awards (3 / 2 / 1 pts) are stored as a bonus on the match line.
    const starPoints = gameweekMatches.reduce((s, m) => s + (m.stats.bonus ?? 0), 0);
    const starWins = gameweekMatches.filter((m) => (m.stats.bonus ?? 0) > 0).length;
    return [
      {
        key: "app",
        abbr: "APP",
        means: asSub
          ? "Appearance — came off the bench"
          : "Appearance — played in your match day 11",
        total: apps,
        rate: appRate,
        points: Math.round(apps * appRate * 100) / 100,
      },
      ...rows,
      {
        key: "star",
        abbr: "STAR",
        means: "Star player award — ★★★ 3 pts, ★★ 2 pts, ★ 1 pt",
        total: starWins,
        rate: null as number | null,
        points: Math.round(starPoints * 100) / 100,
      },
    ];
  }, [seasonRows, gameweekMatches, asSub]);
  const espnRows = useMemo(
    () => seasonRows.filter((r) => !isOurScoringStat(r.key)),
    [seasonRows],
  );
  /** Clean sheets are a scoring rule, not an ESPN stat column — derive them. */
  const cleanSheetRows = useMemo(() => {
    const rate = scaleRate(pos === "gk" || pos === "def" ? 4 : pos === "mid" ? 1 : null);
    const rateShort = scaleRate(pos === "gk" || pos === "def" ? 2 : pos === "mid" ? 0.5 : null);
    if (rate == null || rateShort == null) return [];
    const played = gameweekMatches.filter((m) => (m.stats.minutes ?? 0) > 0 && (m.stats.goals_conceded ?? 0) === 0);
    const full = played.filter((m) => (m.stats.minutes ?? 0) >= 60).length;
    const short = played.length - full;
    return [
      { key: "cs", abbr: "CS", means: "Clean sheet (60+ mins)", total: full, rate, points: Math.round(full * rate * 100) / 100 },
      { key: "cs-", abbr: "CS-", means: "Clean sheet (under 60 mins)", total: short, rate: rateShort, points: Math.round(short * rateShort * 100) / 100 },
    ];
  }, [gameweekMatches, pos, rateMul]);
  const pointRows = useMemo(
    () =>
      gameweekMatches.map((match) => {
        const minutes = match.stats.minutes ?? 0;
        const appearance = minutes > 0 ? (asSub ? 1 : 2) : 0;
        const ourStatPoints = scoringStatKeys(pos)
          .filter((key) => isOurScoringStat(key) && key !== "minutes")
          .reduce((sum, key) => {
            const rate = scaleRate(statPointsPer(key, pos));
            return sum + (rate == null ? 0 : (match.stats[key] ?? 0) * rate);
          }, 0);
        const cleanSheetRate =
          minutes > 0 && (match.stats.goals_conceded ?? 0) === 0
            ? scaleRate(
                minutes >= 60
                  ? pos === "gk" || pos === "def" ? 4 : pos === "mid" ? 1 : null
                  : pos === "gk" || pos === "def" ? 2 : pos === "mid" ? 0.5 : null,
              ) ?? 0
            : 0;
        const espnPoints = scoringStatKeys(pos)
          .filter((key) => !isOurScoringStat(key))
          .reduce((sum, key) => {
            const rate = scaleRate(statPointsPer(key, pos));
            return sum + (rate == null ? 0 : (match.stats[key] ?? 0) * rate);
          }, 0);
        return {
          ...match,
          ourPoints:
            Math.round((appearance + ourStatPoints + cleanSheetRate + (match.stats.bonus ?? 0)) * 100) / 100,
          espnPoints: Math.round(espnPoints * 100) / 100,
        };
      }),
    [gameweekMatches, pos, asSub, rateMul],
  );
  const weeklyPointRows = pointRows;
  const ourSeasonPoints = pointRows.reduce((sum, match) => sum + match.ourPoints, 0);
  const espnSeasonPoints = pointRows.reduce((sum, match) => sum + match.espnPoints, 0);

  return (
    <Dialog open={!!playerId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="size-4 text-red-500" />
            {data?.name ?? "Player stats"}
          </DialogTitle>
          <DialogDescription>
          Every abbreviation we score on, the ESPN match-report stats behind them and the points earned.
          </DialogDescription>
          {picked && (
            <p className="text-xs font-semibold text-emerald-500">
              Scored as a {POSITION_LABEL[pos].toLowerCase()} — the role you selected him in.
            </p>
          )}
          {asSub && (
            <p className="text-xs font-semibold text-amber-500">
              Named on the bench — he only scores if he comes on. If he does, he earns 1 point for the
              appearance and half points on every line below (a starter who features gets 2 for the
              appearance and full points). Stays on the bench, or comes on after your five scoring subs,
              and he scores 0.
            </p>
          )}
        </DialogHeader>

        {query.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading stats…
          </div>
        ) : query.isError ? (
          <p className="py-4 text-sm text-destructive">Couldn't load this player's stats.</p>
        ) : (
          <>
            {matches.length === 0 && (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No stats recorded yet — the tables below fill in automatically once this player features
                in a finished game week and ESPN confirm the match stats.
              </p>
            )}
            <Tabs defaultValue="ours" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ours">Our points</TabsTrigger>
                <TabsTrigger value="espn">ESPN stats</TabsTrigger>
              </TabsList>

              <TabsContent value="ours" className="space-y-2">
                <h4 className="text-sm font-bold">Our points &amp; abbreviations</h4>
                <p className="text-xs text-muted-foreground">
                  {asSub
                    ? `Points shown are what a ${POSITION_LABEL[pos].toLowerCase()} earns if he comes off the bench — 1 point for the appearance plus half points on every line. Stays on the bench, or comes on after your five scoring subs, and he scores 0; starts in your match day 11 he earns 2 for the appearance and full points.`
                    : `Points shown are what a ${POSITION_LABEL[pos].toLowerCase()} earns if he plays in your match day 11 — 2 points for the appearance plus the full points on every line. Named but doesn't feature, he scores 0; off the bench he earns 1 for the appearance and half points.`}
                </p>
                <p className="text-xs font-semibold text-emerald-500">
                  This tab only: appearance, goals, assists, clean sheets and cards.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2">Abbr</th>
                        <th className="py-2 pr-2">Means</th>
                        <th className="px-2 py-2 text-right">Game week</th>
                        <th className="py-2 pl-2 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ourRows.map((r) => (
                        <tr key={r.key} className="border-b border-border/60">
                          <td className="py-1.5 pr-2">
                            <StatAbbrLabel abbr={r.abbr} means={r.means} rate={r.rate} />
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{r.means}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.total}</td>
                          <td className="py-1.5 pl-2 text-right font-bold tabular-nums text-primary">
                            {r.points == null ? "—" : r.points}
                          </td>
                        </tr>
                      ))}
                      {cleanSheetRows.map((r) => (
                        <tr key={r.key} className="border-b border-border/60">
                          <td className="py-1.5 pr-2">
                            <StatAbbrLabel abbr={r.abbr} means={r.means} rate={r.rate} />
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{r.means}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.total}</td>
                          <td className="py-1.5 pl-2 text-right font-bold tabular-nums text-primary">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-1">
                    <h4 className="text-sm font-bold">Our weekly points</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[320px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-2">Game week</th>
                            <th className="py-2 pl-2 text-right">Our points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklyPointRows.map((m) => (
                            <tr key={m.fixtureId} className="border-b border-border/60">
                              <td className="py-1.5 pr-2 text-muted-foreground">
                                <span className="font-bold text-foreground">
                                  {m.gwNumber != null ? `GW${m.gwNumber}` : "—"}
                                </span>{" "}
                                {m.label}
                              </td>
                              <td className="py-1.5 pl-2 text-right font-bold tabular-nums text-primary">
                                {m.ourPoints} pts
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-semibold">Our gameweek total</span>
                  <span className="font-bold tabular-nums text-primary">{ourSeasonPoints} pts</span>
                </div>
              </TabsContent>

              <TabsContent value="espn" className="space-y-3">
                <h4 className="text-sm font-bold">ESPN match centre points</h4>
                <p className="text-xs text-muted-foreground">
                  Scored as a {POSITION_LABEL[pos].toLowerCase()} — these are the ESPN match-report
                  stats that earn points in that role. Subs earn half.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2">Abbr</th>
                        <th className="py-2 pr-2">Means</th>
                        <th className="px-2 py-2 text-right">Game week</th>
                        <th className="py-2 pl-2 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {espnRows.map((r) => (
                        <tr key={r.key} className="border-b border-border/60">
                          <td className="py-1.5 pr-2">
                            <StatAbbrLabel abbr={r.abbr} means={r.means} rate={r.rate} />
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">{r.means}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.total}</td>
                          <td className="py-1.5 pl-2 text-right font-bold tabular-nums text-primary">
                            {r.points == null ? "—" : r.points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {gameweekMatches.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    No ESPN match stats yet — they arrive automatically from the ESPN match centre once
                    this player features in a finished game week.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">Weekly totals — ESPN match stats</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-2">Stat</th>
                            {weeklyPointRows.map((m) => (
                              <th key={m.fixtureId} className="px-2 py-2 text-center">
                                <div className="font-bold text-foreground">
                                  {m.gwNumber != null ? `GW${m.gwNumber}` : "—"}
                                </div>
                                <div className="font-normal normal-case">{m.label}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {statKeys.map((k) => {
                            const meta = PLAYER_STAT_META[k]!;
                            return (
                              <tr key={k} className="border-b border-border/60">
                                <td className="py-1.5 pr-2 text-muted-foreground">
                                  <StatAbbrLabel abbr={meta.abbr} means={meta.means} rate={statPointsPer(k, pos)} />
                                </td>
                                {gameweekMatches.map((m) => (
                                  <td key={m.fixtureId} className="px-2 py-1.5 text-center tabular-nums">
                                    {m.stats[k] ?? 0}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-semibold">ESPN weekly total</span>
                      <span className="font-bold tabular-nums text-primary">{espnSeasonPoints} pts</span>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FantasyPageWithStats() {
  const [stats, setStats] = useState<{ playerId: string; scoringAs: FantasyPosition | null; asSub: boolean; gameweekNumber: number | null } | null>(null);
  const open = useCallback(
    (playerId: string, scoringAs?: FantasyPosition | null, asSub?: boolean, gameweekNumber?: number | null) =>
      setStats({ playerId, scoringAs: scoringAs ?? null, asSub: !!asSub, gameweekNumber: gameweekNumber ?? null }),
    [],
  );
  return (
    <PlayerStatsCtx.Provider value={open}>
      <BoroFantasyPage />
      <PlayerStatsDialog
        playerId={stats?.playerId ?? null}
        scoringAs={stats?.scoringAs ?? null}
        asSub={stats?.asSub ?? false}
        gameweekNumber={stats?.gameweekNumber ?? null}
        onClose={() => setStats(null)}
      />
    </PlayerStatsCtx.Provider>
  );
}

type GuestSession = { guestId: string; email: string; pin: string; displayName: string; teamName?: string };
const GUEST_KEY = "fantasy_guest_session";
const BENCH_SLOT_LABELS = ["Sub GK", "Sub", "Sub", "Sub"] as const;

const kickoffLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Called off (postponed/cancelled/abandoned/suspended) — parked until a new date lands. */
const isPostponedGw = (g: { fixtureStatus?: string | null }) =>
  /postpon|cancel|abandon|suspend/i.test(g.fixtureStatus ?? "");

/** Week-commencing label for cup/play-off ties whose exact date isn't confirmed yet. */
const wcLabel = (iso: string) => {
  const d = new Date(iso);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7)); // back to Monday
  return `w/c ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
};

/** How a gameweek's date should read: exact kick-off, or "w/c <date> (TBC)" when unconfirmed. */
const gwDateLabel = (g: { kickoffAt: string; dateTbc?: boolean }) =>
  g.dateTbc ? `${wcLabel(g.kickoffAt)} (TBC)` : kickoffLabel(g.kickoffAt);

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
  const targetMs = lockMs;
  const activeLabel = label;
  const remaining = targetMs - now;
  const locked = remaining <= 0;
  const urgent = remaining > 0 && remaining <= 60 * 60 * 1000;

  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const lockDate = new Date(lockAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  const unit = (value: number, suffix: string) => (
    <div className={`flex flex-col items-center ${compact ? "min-w-[1.7rem] sm:min-w-[2.4rem]" : "min-w-[3.2rem]"}`}>
      <div className={`relative rounded-lg border-2 font-digital font-black tabular-nums leading-none ${
        compact
          ? "px-1 py-0.5 text-sm sm:px-1.5 sm:py-1 sm:text-base"
          : "px-2 py-1.5 sm:px-3 sm:py-2 text-xl sm:text-2xl"
      } ${
        urgent
          ? "bg-red-600/20 border-red-400 text-red-300 shadow-[0_0_18px_rgba(248,113,113,0.55)] animate-pulse"
          : "bg-amber-500/15 border-amber-400/70 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
      }`}>
        {value.toString().padStart(2, "0")}
      </div>
      <span className={`${compact ? "text-[8px] sm:text-[9px]" : "text-[10px] sm:text-[11px]"} font-semibold uppercase tracking-wider text-white/70 mt-1`}>{suffix}</span>
    </div>
  );

  if (compact) {
    return (
      <div className="w-full min-w-0 overflow-hidden rounded-md text-center">
        <div className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-white/90">
          {lockDate}
        </div>
        <div
          className={`mt-0.5 box-border block w-full min-w-0 overflow-hidden whitespace-nowrap rounded-md border-2 px-1 py-0.5 text-center font-digital font-black tabular-nums leading-none text-[10px] sm:text-xs ${
            urgent
              ? "bg-red-600/20 border-red-400 text-red-300 animate-pulse"
              : "bg-amber-500/15 border-amber-400/70 text-amber-300"
          }`}
        >
          {locked
            ? "LOCKED"
            : `${days > 0 ? `${days}d ` : ""}${hours.toString().padStart(2, "0")}:${minutes
                .toString()
                .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`}
        </div>
        <div className={`mt-0.5 flex items-center justify-center gap-1 font-digital font-bold uppercase tracking-wide text-[9px] sm:text-[10px] ${urgent ? "text-red-300" : "text-amber-300"}`}>
          <Lock className="size-2.5 sm:size-3 shrink-0" strokeWidth={3} />
          <span className="truncate">{locked ? "Locked" : activeLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 text-center">
      <div className="mb-1 text-sm font-bold uppercase tracking-wide text-white/90">
        {lockDate}
      </div>
      {locked ? (
        <div className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border-2 border-red-400 bg-red-600/20 font-digital font-black text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.55)] ${compact ? "px-1.5 py-0.5 text-xs sm:px-2.5 sm:py-1 sm:text-sm" : "px-4 py-2 text-lg"}`}>
          <Lock className={compact ? "size-3 sm:size-4" : "size-5"} strokeWidth={3} /> SQUAD LOCKED
        </div>
      ) : (
        <div className={`flex items-start justify-center ${compact ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-3"}`}>
          {days > 0 && unit(days, "Days")}
          {unit(hours, "Hrs")}
          <span className={`font-digital text-white/40 ${compact ? "text-base pt-0.5 sm:text-lg sm:pt-1" : "text-2xl pt-2"}`}>:</span>
          {unit(minutes, "Min")}
          <span className={`font-digital text-white/40 ${compact ? "text-base pt-0.5 sm:text-lg sm:pt-1" : "text-2xl pt-2"}`}>:</span>
          {unit(seconds, "Sec")}
        </div>
      )}
      <div className={`mt-1 flex items-center justify-center gap-1.5 sm:gap-2 font-digital font-bold uppercase tracking-widest ${compact ? "text-[10px] sm:text-[11px]" : "text-sm"} ${urgent ? "text-red-300" : "text-amber-300"}`}>
        <Lock className={compact ? "size-3 sm:size-3.5" : "size-4"} strokeWidth={3} />
        {locked ? "Locked" : label}
      </div>
    </div>
  );
}

function Loading() {
  return <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
}

function BoroFantasyPage() {
  const { user, hasAny } = useAuth();
  const canManageEntrants = !!user && hasAny(["admin", "management"]);
  const qc = useQueryClient();
  const [tab, setTab] = useState("squad");
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [showGuestLogin, setShowGuestLogin] = useState(false);
  const [guestMode, setGuestMode] = useState<"signin" | "register">("signin");
  const [joining, setJoining] = useState(false);
  const [markingFinished, setMarkingFinished] = useState(false);

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
  const removeEntrantFn = useServerFn(adminRemoveFantasyEntrant);
  const setGwStatusFn = useServerFn(adminSetFantasyGameweekStatus);

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

  // Team news / live scoring: ask the server to re-check the official starting
  // XI so automatic line-up swaps land on the pitch without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetch("/api/public/hooks/sync-fantasy-scores", { method: "POST" });
        const json = (await res.json()) as { swaps?: string[]; scored?: unknown[]; live?: unknown[] };
        if (cancelled) return;
        if ((json.swaps?.length ?? 0) > 0 || (json.live?.length ?? 0) > 0 || (json.scored?.length ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["fantasy-state"] });
          qc.invalidateQueries({ queryKey: ["fantasy-swap-history"] });
          qc.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
        }
      } catch { /* ignore */ }
    };
    void ping();
    const onFocus = () => { void ping(); };
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(ping, 60_000);
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

  const prevGwFn = useServerFn(getFantasyPreviousGameweekScores);
  const publicPrevGwFn = useServerFn(getPublicFantasyPreviousGameweekScores);
  const prevGwQuery = useQuery<FantasyPreviousGwScoreDTO | null>({
    queryKey: ["fantasy-previous-gw", user?.id ?? null],
    queryFn: () => (user ? prevGwFn({}) : publicPrevGwFn({})),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
          qc.invalidateQueries({ queryKey: ["fantasy-previous-gw"] });
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

  async function handleMarkFinished(gameweekId: string) {
    setMarkingFinished(true);
    try {
      await setGwStatusFn({ data: { gameweekId, status: "final" } });
      toast.success("Gameweek marked as finished");
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("fantasy") });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark gameweek as finished");
    } finally {
      setMarkingFinished(false);
    }
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
    <div className={user ? "relative isolate min-h-dvh md:h-dvh md:overflow-hidden flex bg-transparent" : "relative isolate min-h-screen flex bg-transparent"}>
      <img src={riversideBg} alt="" aria-hidden className="pointer-events-none fixed inset-0 z-0 h-screen w-screen object-cover object-center" />
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "rgba(2, 6, 14, 0.78)" }} aria-hidden />
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
                  <Button onClick={() => { setGuestMode("signin"); setShowGuestLogin(true); }} className="bg-white text-primary hover:bg-white/90">Guest sign in</Button>
                  <Button onClick={() => { setGuestMode("register"); setShowGuestLogin(true); }} variant="outline" className="border-white/70 bg-white/10 text-white hover:bg-white/20">Guest register</Button>
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
              initialMode={guestMode}
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

          <div className="w-full overflow-hidden rounded-xl border border-border/60 bg-background/45 backdrop-blur-sm">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full h-auto gap-0 p-0 rounded-none border-b border-border/60 bg-background/70">
                <TabsTrigger value="squad" className="w-full rounded-none border-r border-border/40 last:border-r-0">My squad</TabsTrigger>
                <TabsTrigger value="rules" className="w-full rounded-none border-r border-border/40 last:border-r-0">Game rules</TabsTrigger>

                <TabsTrigger value="leaderboard" className="w-full rounded-none border-r border-border/40 last:border-r-0">Leaderboard</TabsTrigger>
                <TabsTrigger value="scoring" className="w-full rounded-none border-r border-border/40 last:border-r-0">Scoring</TabsTrigger>
                <TabsTrigger value="winners" className="w-full rounded-none border-r border-border/40 last:border-r-0">Winners</TabsTrigger>
              </TabsList>

              <TabsContent value="squad" className="mt-4 px-0">
                {stateQuery.isLoading || !state ? <Loading /> : (
                  <SquadBuilder
                    state={state}
                    canPlay={canPlay}
                    onSave={handleSquadSave}
                    name={guest?.displayName ?? null}
                    teamName={currentTeamName}
                    canEdit={canPlay}
                    onEdit={openNameDialog}
                    isMember={!!user}
                    guestCreds={guest ? { email: guest.email, pin: guest.pin } : null}
                    canManageEntrants={canManageEntrants}
                    onMarkFinished={handleMarkFinished}
                    markingFinished={markingFinished}
                  />
                )}
              </TabsContent>

              <TabsContent value="rules" className="mt-4">
                <SquadRulesTab />
              </TabsContent>


              <TabsContent value="leaderboard" className="mt-4">
                {lbQuery.isLoading ? (
                  <Loading />
                ) : (
                  <LeaderboardTable
                    rows={lbQuery.data ?? []}
                    gameweeks={state?.gameweeks ?? []}
                    previousGameweek={prevGwQuery.data}
                    canRemove={canManageEntrants}
                    onRemove={async (row) => {
                      await removeEntrantFn({ data: { entrantId: row.entrantId, isGuest: row.isGuest } });
                      await qc.invalidateQueries({ queryKey: ["fantasy-leaderboard"] });
                    }}
                  />
                )}
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
  state, name, teamName, canEdit, onEdit, compact, gameweekId,
  checklist, locked, canPlay, swapCount, onOpenSwaps,
}: {
  state?: FantasyStateDTO;
  name: string | null;
  teamName?: string;
  canEdit?: boolean;
  onEdit?: () => void;
  compact?: boolean;
  gameweekId?: string;
  checklist?: { title: string; items: string[] };
  locked?: boolean;
  canPlay?: boolean;
  swapCount?: number;
  onOpenSwaps?: () => void;
}) {
  const total = (state?.squads ?? []).reduce((sum, s) => sum + (s.points ?? 0), 0);
  const selectedSquad = gameweekId
    ? state?.squads?.find((s) => s.gameweekId === gameweekId)
    : undefined;
  const gamePoints = selectedSquad ? (selectedSquad.points ?? 0) : 0;
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
              <span className="font-bold text-primary">{gamePoints} wk pts</span>
              <span className="text-muted-foreground">{total} total pts</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Your team</div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0 break-words font-display text-lg font-bold leading-tight">
          {teamName || state?.teamName || name || "Unnamed FC"}
        </div>
        {canEdit && onEdit && (
          <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={onEdit}>
            <Pencil className="size-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
      <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 rounded-xl bg-muted/40 p-2">
          <dt className="break-words text-[11px] leading-tight text-muted-foreground">Week Game Pts Earned</dt>
          <dd className="font-bold text-primary">{gamePoints}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-muted/40 p-2">
          <dt className="break-words text-[11px] leading-tight text-muted-foreground">Total points</dt>
          <dd className="font-bold text-primary">{total}</dd>
        </div>
      </dl>

      {checklist && (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" />
            <h4 className="font-display text-xs font-bold uppercase tracking-wide">{checklist.title}</h4>
            {canPlay && !locked && (
              <span
                className={
                  "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold border " +
                  (checklist.items.length === 0
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-destructive/40 bg-destructive/15 text-destructive")
                }
              >
                {checklist.items.length === 0 ? "Ready" : `${checklist.items.length} to fix`}
              </span>
            )}
          </div>
          {!canPlay || locked ? (
            <p className="text-xs text-muted-foreground">
              {locked
                ? "This gameweek is locked — the checklist reopens for the next one."
                : "Join the game to start building a valid squad."}
            </p>
          ) : checklist.items.length === 0 ? (
            <p className="text-xs text-emerald-300">
              Match day 11 and bench are valid — hit <span className="font-semibold">Save Matchday Squad</span>.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {checklist.items.map((p) => (
                <li key={p} className="flex gap-2 text-xs leading-relaxed">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span className="min-w-0">{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {canPlay && onOpenSwaps && (
        <button
          type="button"
          onClick={onOpenSwaps}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-left text-sm transition-colors hover:bg-sky-500/15"
        >
          <span className="flex items-center gap-2 font-semibold text-sky-300">
            <ArrowRightLeft className="size-4" /> Automatic line-up swaps
          </span>
          <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold text-sky-200">
            {swapCount ?? 0} {((swapCount ?? 0) === 1) ? "swap" : "swaps"}
          </span>
        </button>
      )}
    </div>
  );
}


// ------------------------------------------------------------------
// Squad builder
// ------------------------------------------------------------------
type SavePayload = {
  gameweekId: string;
  formation: string;
  starters: (string | null)[];
  bench: (string | null)[];
  captainId: string;
  viceId: string;
  /** Chosen scoring position per XI slot (dual-position players on flexible slots). */
  starterPositions?: (FantasyPosition | null)[];
  /** Chosen scoring position per bench slot (dual-position subs). */
  benchPositions?: (FantasyPosition | null)[];
};

function SquadBuilder({
  state, canPlay, onSave, name, teamName, canEdit, onEdit, isMember, guestCreds,
  canManageEntrants, onMarkFinished, markingFinished,
}: {
  state: FantasyStateDTO;
  canPlay: boolean;
  onSave: (p: SavePayload) => Promise<void>;
  name: string | null;
  teamName: string;
  canEdit: boolean;
  onEdit: () => void;
  isMember: boolean;
  guestCreds: { email: string; pin: string } | null;
  canManageEntrants: boolean;
  onMarkFinished: (gameweekId: string) => Promise<void>;
  markingFinished: boolean;
}) {
  // Members keep every gameweek in the dropdown — locked and finished weeks stay
  // selectable (read-only) so they can look back at past squads. Guests only see
  // weeks still open for picks, plus any past week they actually entered a team for.
  const openGameweeks = useMemo(
    () =>
      [...state.gameweeks]
        .filter((g) => {
          if (isMember) return true;
          const stillOpen = g.status === "upcoming" && new Date(g.lockAt).getTime() > Date.now();
          if (stillOpen) return true;
          return (state.squads ?? []).some((s) => s.gameweekId === g.id);
        })
        // Gameweek numbers run chronologically across league, cup and play-off
        // games, so one ordered list covers everything.
        .sort((a, b) => (a.gwNumber ?? 0) - (b.gwNumber ?? 0)),
    [state.gameweeks, state.squads, isMember],
  );

  /** Still open for picks — used only to choose a sensible default selection. */
  const selectableGameweeks = useMemo(
    () => openGameweeks.filter((g) => g.status === "upcoming" && new Date(g.lockAt).getTime() > Date.now()),
    [openGameweeks],
  );
  // Called-off games drop to the bottom under their own header until a new date is confirmed.
  const scheduledGameweeks = useMemo(() => openGameweeks.filter((g) => !isPostponedGw(g)), [openGameweeks]);
  const postponedGameweeks = useMemo(() => openGameweeks.filter((g) => isPostponedGw(g)), [openGameweeks]);
  const [gwId, setGwId] = useState<string>(state.currentGameweekId ?? "");
  useEffect(() => {
    const valid = openGameweeks.some((g) => g.id === gwId);
    if (!valid) {
      const current = openGameweeks.find((g) => g.id === state.currentGameweekId)?.id;
      setGwId(current ?? selectableGameweeks[0]?.id ?? openGameweeks[0]?.id ?? "");
    }
  }, [state.currentGameweekId, selectableGameweeks, openGameweeks, gwId]);

  const gw = state.gameweeks.find((g) => g.id === gwId) ?? null;
  /** League games are restricted to the club's 25-man squad; cup ties are open to anyone. */
  const isLeagueGw = gw ? fantasyCompetitionGroup(gw.competition) === "league" : true;
  const existing = gw ? state.squads.find((s) => s.gameweekId === gw.id) : undefined;
  const playerById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);

  const [formation, setFormation] = useState<FormationKey>((existing?.formation as FormationKey) ?? "4-4-2");
  const [selected, setSelected] = useState<string[]>(existing ? existing.picks.map((p) => p.playerId) : []);
  const [starters, setStarters] = useState<(string | null)[]>(Array(11).fill(null));
  /**
   * Which of a two-position player's roles he plays in each XI slot. Only
   * flexible slots ever differ from the default; null means "work it out".
   */
  const [slotPositions, setSlotPositions] = useState<(FantasyPosition | null)[]>(Array(11).fill(null));
  const [bench, setBench] = useState<(string | null)[]>([]);
  /** Which role a two-position sub is scored in; null means his main position. */
  const [benchPositions, setBenchPositions] = useState<(FantasyPosition | null)[]>([]);
  const [captainId, setCaptainId] = useState<string>(existing?.captainId ?? "");
  const [viceId, setViceId] = useState<string>(existing?.viceId ?? "");
  const [saving, setSaving] = useState(false);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  // Unsaved picks survive a refresh or crash: they're kept in a per-gameweek
  // local draft until the squad is saved.
  // v2 invalidates drafts polluted by the old gameweek-switch race, which
  // could write the previous week's players under a future gameweek key.
  const draftKey = gw ? `mfc-fantasy-draft-v2:${gw.id}` : null;
  const [draftLoaded, setDraftLoaded] = useState(false);
  const restoredDraftRef = useRef(false);
  const skipNextDraftSaveRef = useRef(false);
  /** Has this gameweek locked? Once it has, the server's picks are the truth. */
  const gwLocked = !!gw && (gw.status !== "upcoming" || new Date(gw.lockAt).getTime() <= Date.now());
  /**
   * Fingerprint of the saved squad. Automatic line-up swaps rewrite picks
   * server-side without changing the squad id, so the pitch has to re-hydrate
   * whenever any pick moves.
   */
  const existingSig = useMemo(
    () =>
      existing
        ? [
            existing.id,
            existing.formation,
            existing.captainId ?? "",
            existing.viceId ?? "",
            ...[...existing.picks]
              .map((p) => `${p.playerId}:${p.isStarter ? 1 : 0}:${p.slotOrder}:${p.pickedPosition ?? ""}:${p.lineupSwapNote ? 1 : 0}`)
              .sort(),
          ].join("|")
        : "none",
    [existing],
  );

  useEffect(() => {
    // State updates below apply on the next render. Prevent the save effect in
    // this same commit from persisting the previous gameweek's state.
    skipNextDraftSaveRef.current = true;
    setDraftLoaded(false);
    restoredDraftRef.current = false;
    const applyExisting = () => {
      if (!existing) {
        // No saved squad for this gameweek — start from a clean sheet rather
        // than carrying over the previous week's picks.
        setFormation("4-4-2");
        setSelected([]);
        setStarters(Array(11).fill(null));
        setSlotPositions(Array(11).fill(null));
        setBench(Array(benchRulesFor(gw?.competition).size).fill(null));
        setBenchPositions(Array(benchRulesFor(gw?.competition).size).fill(null));
        setCaptainId("");
        setViceId("");
        return;
      }
      setFormation(existing.formation as FormationKey);
      setSelected(existing.picks.map((p) => p.playerId));
      const size = benchRulesFor(gw?.competition).size;
      const st = Array(11).fill(null) as (string | null)[];
      const bn = Array(size).fill(null) as (string | null)[];
      const sp = Array(11).fill(null) as (FantasyPosition | null)[];
      const bp = Array(size).fill(null) as (FantasyPosition | null)[];
      for (const p of existing.picks) {
        if (p.isStarter && p.slotOrder >= 0 && p.slotOrder < 11) {
          st[p.slotOrder] = p.playerId;
          sp[p.slotOrder] = (p.pickedPosition ?? null) as FantasyPosition | null;
        }
        else if (!p.isStarter && p.slotOrder >= 0 && p.slotOrder < size) {
          bn[p.slotOrder] = p.playerId;
          bp[p.slotOrder] = (p.pickedPosition ?? null) as FantasyPosition | null;
        }
      }
      setStarters(st);
      setSlotPositions(sp);
      setBench(bn);
      setBenchPositions(bp);
      setCaptainId(existing.captainId ?? "");
      setViceId(existing.viceId ?? "");
    };
    if (!draftKey || gwLocked) {
      applyExisting();
      setDraftLoaded(true);
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Partial<SavePayload> & { selected?: string[] };
        if (Array.isArray(d.selected) && d.selected.length) {
          if (d.formation) setFormation(d.formation as FormationKey);
          setSelected(d.selected);
          setStarters(Array.isArray(d.starters) && d.starters.length === 11 ? d.starters : Array(11).fill(null));
          setSlotPositions(
            Array.isArray(d.starterPositions) && d.starterPositions.length === 11
              ? d.starterPositions
              : Array(11).fill(null),
          );
          setBench(Array.isArray(d.bench) && d.bench.length === benchRulesFor(gw?.competition).size ? d.bench : Array(benchRulesFor(gw?.competition).size).fill(null));
          setBenchPositions(
            Array.isArray(d.benchPositions) && d.benchPositions.length === benchRulesFor(gw?.competition).size
              ? d.benchPositions
              : Array(benchRulesFor(gw?.competition).size).fill(null),
          );
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
  }, [draftKey, existingSig, gwId, gwLocked]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    try {
      if (!selected.length) localStorage.removeItem(draftKey);
      else
        localStorage.setItem(
          draftKey,
          JSON.stringify({ formation, selected, starters, starterPositions: slotPositions, bench, benchPositions, captainId, viceId, at: Date.now() }),
        );
    } catch {
      /* storage full or blocked — drafting still works in-memory */
    }
  }, [draftKey, draftLoaded, formation, selected, starters, slotPositions, bench, benchPositions, captainId, viceId]);

  // Captain and vice-captain are the manager's choice and are never reassigned by
  // the app. They are only cleared when that player is no longer in the XI.
  useEffect(() => {
    // On refresh the saved captaincy arrives before the saved XI has been copied
    // into local slot state. Do not reconcile during that hydration render or the
    // still-empty starter array will incorrectly clear both saved armbands.
    if (!draftLoaded) return;
    if (captainId && !starters.includes(captainId)) setCaptainId("");
    if (viceId && !starters.includes(viceId)) setViceId("");
  }, [draftLoaded, starters, captainId, viceId]);

  const counts = formationCounts(formation);
  /** Bench size follows the real substitute rules of this gameweek's competition. */
  const benchRules = useMemo(() => benchRulesFor(gw?.competition), [gw?.competition]);
  const squadSize = 11 + benchRules.size;
  /** Match day 11 for the chosen formation plus the full bench allowance (no minimum cover). */
  const posQuota = useMemo(() => {
    const r = formationPositionRange(formation);
    return {
      // One starting GK + one replacement GK (sub 1). Other positions can fill the rest of the bench.
      gk: r.gk.max + 1,
      def: r.def.max + benchRules.size,
      mid: r.mid.max + benchRules.size,
      fwd: r.fwd.max + benchRules.size,
    } as Record<FantasyPosition, number>;
  }, [formation, benchRules]);
  const byPos = (ids: (string | null)[], pos: FantasyPosition) => ids.filter((id): id is string => !!id && playerById.get(id)?.position === pos);
  /** Ids eligible for a position, counting a player's optional second position. */
  const eligibleFor = (ids: (string | null)[], pos: FantasyPosition) =>
    ids.filter((id): id is string => {
      const p = id ? playerById.get(id) : null;
      return !!p && playerPositions(p).includes(pos);
    });
  const benchHasGk = (sel: string[], st: (string | null)[], excludeId?: string) =>
    byPos(sel.filter((id) => id !== excludeId && !st.includes(id)) as (string | null)[], "gk").length > 0;

  const nowTick = useNow(1000);
  const pastLock = !!gw && new Date(gw.lockAt).getTime() <= nowTick;
  const locked = !!gw && (gw.status !== "upcoming" || pastLock);

  const xiProblems: string[] = [];
  const starterCount = starters.filter(Boolean).length;
  if (starterCount !== 11) xiProblems.push(`Pick 11 starters (${starterCount} selected).`);
  else {
    const range = formationPositionRange(formation);
    const sets = starters
      .filter((id): id is string => !!id)
      .map((id) => playerPositions(playerById.get(id)!));
    if (!xiFitsFormation(formation, sets)) {
      const shape = POSITION_ORDER.filter((pos) => range[pos].max > 0)
        .map((pos) =>
          range[pos].min === range[pos].max
            ? `${range[pos].min} ${POSITION_SHORT[pos]}`
            : `${range[pos].min}–${range[pos].max} ${POSITION_SHORT[pos]}`,
        )
        .join(", ");
      xiProblems.push(`${formation}: your XI doesn't fit — needs ${shape}.`);
    }
  }
  const benchCount = bench.filter(Boolean).length;
  if (benchCount !== benchRules.size)
    xiProblems.push(`${benchRules.competition} allows ${benchRules.size} subs — name ${benchRules.size} (you have ${benchCount}).`);
  const benchGkCount = byPos(bench, "gk").length;
  if (benchGkCount < benchRules.minGk)
    xiProblems.push(`Your bench needs at least ${benchRules.minGk} goalkeeper (you have ${benchGkCount}).`);
  if (!captainId || !starters.includes(captainId)) xiProblems.push("Pick a captain from your starting XI.");
  if (!viceId || !starters.includes(viceId)) xiProblems.push("Pick a vice-captain from your starting XI.");
  if (captainId && captainId === viceId) xiProblems.push("Captain and vice-captain must be different.");
  // Dual-position starters on a flexible slot must be told which role they score in.
  {
    const rowsForSlots = formationRows(formation);
    const undecided: string[] = [];
    starters.forEach((id, slotIndex) => {
      if (!id) return;
      const p = playerById.get(id);
      if (!p) return;
      const row = rowsForSlots.find((r) => slotIndex >= r.startIndex && slotIndex < r.startIndex + r.count);
      if (!row) return;
      const allowed = rowPositions(row);
      const eligible = playerPositions(p).filter((pos) => allowed.includes(pos));
      if (eligible.length > 1 && !(slotPositions[slotIndex] && eligible.includes(slotPositions[slotIndex]!))) {
        undecided.push(p.name);
      }
    });
    if (undecided.length)
      xiProblems.push(
        `Choose the scoring position for ${undecided.join(", ")} — tap the "Scores As" buttons on their card.`,
      );
    // Same for two-position subs on the bench.
    const benchUndecided: string[] = [];
    bench.forEach((id, i) => {
      if (!id) return;
      const p = playerById.get(id);
      if (!p) return;
      const eligible = playerPositions(p);
      if (eligible.length > 1 && !(benchPositions[i] && eligible.includes(benchPositions[i]!))) {
        benchUndecided.push(p.name);
      }
    });
    if (benchUndecided.length)
      xiProblems.push(
        `Choose the scoring position for your subs ${benchUndecided.join(", ")} — tap the "Scores As" buttons on their bench card.`,
      );
  }

  const problems = xiProblems;
  const activeChecklist = { title: "Match Day Squad Checklist", items: xiProblems };

  // Live points for this gameweek, straight from the saved squad.
  const pointsByPlayer = useMemo(
    () => new Map((existing?.picks ?? []).map((p) => [p.playerId, p.points])),
    [existing],
  );
  const autoSubbedIds = useMemo(
    () => new Set((existing?.picks ?? []).filter((p) => p.autoSubbed).map((p) => p.playerId)),
    [existing],
  );
  // Automatic swaps made when Boro's official starting XI was announced.
  const lineupSwapNotes = useMemo(
    () =>
      (existing?.picks ?? [])
        .filter((p) => !!p.lineupSwapNote)
        .map((p) => ({
          name: playerById.get(p.playerId)?.name ?? "Player",
          isStarter: p.isStarter,
          note: p.lineupSwapNote as string,
        })),
    [existing, playerById],
  );
  // Game time played in this gameweek's fixture, once any stats are in.
  const minutesByPlayer = useMemo(() => {
    const picks = existing?.picks ?? [];
    const hasStats = picks.some((p) => p.minutes !== null && p.minutes !== undefined);
    if (!hasStats) return new Map<string, number>();
    return new Map(picks.map((p) => [p.playerId, p.minutes ?? 0]));
  }, [existing]);
  // 0-10 match rating for this gameweek's fixture, shown beside each name.
  // Ratings only appear once the gameweek is fully finished (FT + stats in +
  // star players awarded) so managers aren't influenced by a live/preview score.
  const ratingByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    if (!gw?.finished) return map;
    for (const p of existing?.picks ?? []) {
      if (p.rating !== null && p.rating !== undefined && p.rating > 0) map.set(p.playerId, p.rating);
    }
    return map;
  }, [existing?.picks, gw?.finished]);
  const hasGwPoints = (existing?.picks ?? []).some((p) => p.points !== null);

  const editable = !locked && (canPlay || !gw);

  // Position pop-box picker: either filling/swapping an XI slot, or a bench slot.
  const [picker, setPicker] = useState<
    | { mode: "xi"; positions: FantasyPosition[]; slotIndex: number; replaceId?: string }
    | { mode: "bench"; benchIndex: number }
    | null
  >(null);

  // Only highlight Save when something actually differs from the saved squad.
  // Scoring-position choices are part of the squad, so changing them must let
  // the manager save before the deadline and be frozen once the gameweek locks.
  const dirty = useMemo(() => {
    const sameSet = (a: string[], b: (string | null)[]) =>
      a.length === b.filter(Boolean).length && [...a].sort().join(",") === [...b.filter(Boolean)].sort().join(",");
    const samePositions = (saved: (FantasyPosition | null)[], current: (FantasyPosition | null)[]) =>
      saved.length === current.length && saved.every((p, i) => p === current[i]);
    if (!existing) return selected.length > 0;
    const savedSelected = existing.picks.map((p) => p.playerId);
    const savedStarters = existing.picks.filter((p) => p.isStarter).map((p) => p.playerId);
    const savedStarterPositions = Array(11).fill(null).map((_, i) => {
      const pick = existing.picks.find((p) => p.isStarter && p.slotOrder === i);
      return (pick?.pickedPosition ?? null) as FantasyPosition | null;
    });
    const savedBenchPositions = Array(benchRules.size).fill(null).map((_, i) => {
      const pick = existing.picks.find((p) => !p.isStarter && p.slotOrder === i);
      return (pick?.pickedPosition ?? null) as FantasyPosition | null;
    });
    return (
      existing.formation !== formation ||
      (existing.captainId ?? "") !== captainId ||
      (existing.viceId ?? "") !== viceId ||
      !sameSet(savedSelected, selected) ||
      !sameSet(savedStarters, starters) ||
      !samePositions(savedStarterPositions, slotPositions) ||
      !samePositions(savedBenchPositions, benchPositions)
    );
  }, [existing, formation, captainId, viceId, selected, starters, slotPositions, benchPositions, benchRules.size]);

  /** Ensure the player is in the 15 — returns the new squad list, or null if not possible. */
  function withPlayer(sel: string[], p: FantasyPlayerDTO): string[] | null {
    if (sel.includes(p.id)) return sel;
    if (p.status === "departed") { toast.error(`${p.name} has left the club.`); return null; }
    if (p.status === "loaned_out") { toast.error(`${p.name} is out on loan${p.loanClub ? ` at ${p.loanClub}` : ""}.`); return null; }
    // Injured players and senior players outside the official squad are off limits.
    const blocked = pickBlockedReason(p, gw ? gw.kickoffAt : null);
    if (blocked) { toast.error(blocked); return null; }
    if (sel.length >= squadSize) { toast.error(`Squad is full — ${squadSize} players max (11 + ${benchRules.size} subs).`); return null; }
    // A dual-position player only blocks if every position they cover is full.
    const roomInAnyPosition = playerPositions(p).some(
      (pos) => eligibleFor(sel, pos).length < posQuota[pos],
    );
    if (!roomInAnyPosition) {
      toast.error(`${formation} only needs ${posQuota[p.position]} ${playerPositionLabel(p)}s (XI + bench).`);
      return null;
    }
    if ((p.injuryStatus ?? "none") !== "none" && !injuryClearedBy(p, gw ? gw.kickoffAt : null)) {
      const doubtful = p.injuryStatus === "doubtful";
      if (doubtful) {
        // Doubtful players are allowed, but the manager must confirm the risk.
        const ok = window.confirm(
          `${p.name} is a DOUBT for this game${p.injuryNote ? `\n\n${p.injuryNote}` : ""}${
            p.injuryReturn ? `\nExpected back: ${p.injuryReturn}` : ""
          }\n\nPick them anyway?`,
        );
        if (!ok) return null;
        toast.warning(`${p.name} picked while doubtful — at your own risk.`);
      } else {
        toast.warning(
          `${p.name} is suspended${p.injuryNote ? ` (${p.injuryNote})` : ""} — pick at your own risk.`,
        );
      }
    }
    if (isLeagueGw && outOf25(p)) {
      toast.warning(`${p.name} is not included in the 25-man matchday squad for league games.`);
    }
    return [...sel, p.id];
  }

  function removePlayer(id: string) {
    if (!editable) return;
    const slotIdx = starters.indexOf(id);
    const benchIdx = bench.indexOf(id);
    setSelected((prev) => prev.filter((x) => x !== id));
    setStarters((prev) => prev.map((x) => (x === id ? null : x)));
    setBench((prev) => prev.map((x) => (x === id ? null : x)));
    if (slotIdx !== -1) {
      setSlotPositions((prev) => { const next = [...prev]; next[slotIdx] = null; return next; });
    }
    if (benchIdx !== -1) {
      setBenchPositions((prev) => { const next = [...prev]; next[benchIdx] = null; return next; });
    }
  }

  function benchPlayer(id: string) {
    if (!editable) return;
    const p = playerById.get(id);
    if (!p) return;
    if (p.position !== "gk" && !benchHasGk(selected, starters, id)) {
      toast.error("Sub 1 must be the replacement goalkeeper — pick a GK first.");
      return;
    }
    const slotIdx = starters.indexOf(id);
    setStarters((prev) => prev.map((x) => (x === id ? null : x)));
    if (slotIdx !== -1) {
      setSlotPositions((prev) => { const next = [...prev]; next[slotIdx] = null; return next; });
    }
    benchAddById(id);
  }

  /** Put a player into the XI, optionally swapping out whoever holds that slot. */
  function startPlayer(p: FantasyPlayerDTO, slotIndex?: number, _replaceId?: string) {
    if (!editable) return;
    const sel = withPlayer(selected, p);
    if (!sel) return;

    const st = [...starters];
    const targetIdx = typeof slotIndex === "number" && slotIndex >= 0 && slotIndex < 11 ? slotIndex : st.indexOf(null);
    const idx = targetIdx >= 0 ? targetIdx : st.indexOf(null);
    if (idx === -1) return;

    // Remove the player from anywhere else they were already assigned.
    const existingSlot = st.indexOf(p.id);
    if (existingSlot !== -1) {
      st[existingSlot] = null;
      setSlotPositions((prev) => { const next = [...prev]; next[existingSlot] = null; return next; });
    }
    setBench((prev) => {
      const i = prev.indexOf(p.id);
      if (i === -1) return prev;
      const next = [...prev];
      next[i] = null;
      setBenchPositions((bp) => { const bnext = [...bp]; bnext[i] = null; return bnext; });
      return next;
    });

    // Bump the current occupant of the target slot to the bench if there is one.
    const bumped = st[idx];
    let nextSel = sel;
    if (bumped) {
      // Only bench the displaced player if there is room; otherwise drop them
      // from the squad rather than leaving them selected with no slot.
      const bumpedPlayer = playerById.get(bumped);
      const roomOnBench = bumpedPlayer?.position === "gk" ? !bench[0] || bench[0] === bumped : bench.some((x, i) => x === null && i > 0);
      if (roomOnBench) benchAddById(bumped);
      else nextSel = nextSel.filter((x) => x !== bumped);
    }

    st[idx] = p.id;
    setSelected(nextSel);
    setStarters(st);
    // The manager must explicitly choose the scoring position for this slot.
    setSlotPositions((prev) => { const next = [...prev]; next[idx] = null; return next; });
  }

  /** Add a player to the bench into the first empty slot. Sub 1 is reserved for the replacement GK. */
  function benchAdd(p: FantasyPlayerDTO) {
    if (!editable) return;
    const sel = withPlayer(selected, p);
    if (!sel) return;
    const slotIdx = starters.indexOf(p.id);
    setSelected(sel);
    setStarters((prev) => prev.map((x) => (x === p.id ? null : x)));
    if (slotIdx !== -1) {
      setSlotPositions((prev) => { const next = [...prev]; next[slotIdx] = null; return next; });
    }
    benchAddById(p.id);
  }

  function benchAddById(id: string) {
    const p = playerById.get(id);
    if (!p) return;
    let targetIndex = -1;
    if (p.position === "gk") {
      if (bench[0] && bench[0] !== id) {
        toast.error("Sub 1 is reserved for the replacement goalkeeper.");
        return;
      }
      targetIndex = 0;
    } else {
      targetIndex = bench.findIndex((x, i) => x === null && i > 0);
      if (targetIndex === -1) return;
    }
    setBench((prev) => {
      const next = [...prev];
      next[targetIndex] = id;
      return next;
    });
    // Make the manager explicitly pick a scoring position for this bench slot.
    setBenchPositions((prev) => { const next = [...prev]; next[targetIndex] = null; return next; });
  }

  /** Put a player on an exact bench slot (from the sub pop-box) — never shuffle others. */
  function benchAssign(p: FantasyPlayerDTO, benchIndex: number) {
    if (!editable) return;
    if (benchIndex === 0 && p.position !== "gk") {
      toast.error("Sub 1 is reserved for the replacement goalkeeper.");
      return;
    }
    if (benchIndex > 0 && p.position === "gk") {
      toast.error("Goalkeepers go in the Sub 1 slot.");
      return;
    }
    const occupant = bench[benchIndex] && bench[benchIndex] !== p.id ? bench[benchIndex]! : null;
    const sel = withPlayer(
      occupant ? selected.filter((x) => x !== occupant) : selected,
      p,
    );
    if (!sel) return;
    setSelected(sel);
    // Free the player from wherever they already sat.
    setStarters((prev) => prev.map((x) => (x === p.id ? null : x)));
    setBench((prev) => {
      const next = prev.map((x) => (x === p.id ? null : x));
      next[benchIndex] = p.id;
      return next;
    });
  }

  /** Fill any gaps in the match day 11, bench and captaincy from the players picked. */
  function autoCompleteXI() {
    const st = [...starters];
    let pool = selected.filter((id) => !st.includes(id));
    for (let i = 0; i < st.length; i++) {
      if (st[i]) continue;
      const row = formationRows(formation).find((r) => i >= r.startIndex && i < r.startIndex + r.count);
      const allowed = row ? rowPositions(row) : POSITION_ORDER;
      const pick = allowed
        .flatMap((pos) =>
          pool.filter((id) => {
            const pl = playerById.get(id);
            return !!pl && playerPositions(pl).includes(pos);
          }),
        )
        .sort((a, b) => (playerById.get(b)?.seasonPoints ?? 0) - (playerById.get(a)?.seasonPoints ?? 0))[0];
      if (pick) {
        st[i] = pick;
        pool = pool.filter((id) => id !== pick);
      }
    }
    const bn = [...bench];
    // Ensure Sub 1 is a goalkeeper if possible.
    if (!bn[0]) {
      const gk = pool.find((id) => playerById.get(id)?.position === "gk");
      if (gk) { bn[0] = gk; pool = pool.filter((id) => id !== gk); }
    }
    for (let i = 0; i < bn.length; i++) {
      if (bn[i]) continue;
      const pick = pool[0];
      if (pick) {
        bn[i] = pick;
        pool = pool.filter((id) => id !== pick);
      }
    }
    const ranked = st
      .filter(Boolean)
      .sort((a, b) => (playerById.get(b!)?.seasonPoints ?? 0) - (playerById.get(a!)?.seasonPoints ?? 0));
    // Keep the manager's own picks — only fill blanks.
    const keepCap = captainId && st.includes(captainId) ? captainId : "";
    let keepVice = viceId && st.includes(viceId) && viceId !== keepCap ? viceId : "";
    const cap = keepCap || (ranked.find((id) => id !== keepVice) ?? "");
    if (!keepVice) keepVice = ranked.find((id) => id !== cap) ?? "";
    return { starters: st, bench: bn, captainId: cap, viceId: keepVice };
  }

  async function handleSave() {
    if (!gw) return;
    let st = starters;
    let bn = bench;
    let cap = captainId;
    let vice = viceId;
    const filledCount = starters.filter(Boolean).length;
    const needsAutoXI =
      filledCount !== 11 ||
      bench.filter(Boolean).length !== benchRules.size ||
      !cap ||
      !vice ||
      cap === vice ||
      !starters.includes(cap) ||
      !starters.includes(vice);
    if (needsAutoXI) {
      const auto = autoCompleteXI();
      if (auto.starters.filter(Boolean).length !== 11 || !auto.captainId || !auto.viceId || auto.bench.filter(Boolean).length !== benchRules.size) {
        toast.error("Complete your squad of 15 first.");
        return;
      }
      st = auto.starters;
      bn = auto.bench;
      cap = auto.captainId;
      vice = auto.viceId;
      setStarters(st);
      setBench(bn);
      setCaptainId(cap);
      setViceId(vice);
    }
    setSaving(true);
    try {
      await onSave({
        gameweekId: gw.id,
        formation,
        starters: st as string[],
        bench: bn as string[],
        captainId: cap,
        viceId: vice,
        starterPositions: slotPositions,
        benchPositions,
      });
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

  // Green tick only when the saved squad matches what's on the pitch right now —
  // any unsaved change flips it back to a red cross until it's saved again.
  const gwSaved = !!existing && !dirty;

  const gameweekPanel = (
    // Gameweek picker sits at the top so switching weeks is obvious before reading fixture details.
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3">
          {openGameweeks.length > 0 && (
            <div>
              <Select value={gwId} onValueChange={setGwId}>
                <SelectTrigger className="h-9 w-full text-xs [&>span]:truncate">
                  <SelectValue placeholder="Pick a gameweek" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const item = (g: (typeof openGameweeks)[number]) => {
                      const gLocked = g.status !== "upcoming" || new Date(g.lockAt).getTime() <= Date.now();
                      return (
                        <SelectItem key={g.id} value={g.id}>
                          <span className={gLocked ? "line-through text-destructive" : ""}>
                            GW{g.gwNumber} — {g.homeTeam} v {g.awayTeam} ({gwDateLabel(g)})
                            {gLocked && <span className="ml-1 text-[10px] text-destructive font-semibold">(locked)</span>}
                          </span>
                        </SelectItem>
                      );
                    };
                    return (
                      <>
                        {scheduledGameweeks.map(item)}
                        {postponedGameweeks.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
                              Postponed — awaiting new date
                            </SelectLabel>
                            {postponedGameweeks.map(item)}
                          </SelectGroup>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-0">
            {gw ? (
              <>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <span className="min-w-0 break-words font-semibold leading-snug">
                    GW{gw.gwNumber}
                    {gw.dateTbc && (
                      <span className="ml-1 rounded-full border border-sky-400/60 bg-sky-400/10 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-sky-300">
                        TBC
                      </span>
                    )}{" "}
                    — {gw.homeTeam} v {gw.awayTeam}
                  </span>
                  {gwSaved ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400" title="Match day squad saved">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-destructive"
                      title={existing ? "Unsaved changes — save your match day squad" : "No squad saved yet"}
                    >
                      <X className="size-3.5" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {gw.dateTbc ? `${wcLabel(gw.kickoffAt)} (TBC) — date/time still to be confirmed` : kickoffLabel(gw.kickoffAt)}
                </div>
                {(() => {
                  const done = gw.finished === true;
                  const pending = [
                    !/FT|FULL|POST|FINAL/i.test(gw.fixtureStatus ?? "") && gw.status !== "final" ? "match not finished" : null,
                    !gw.statsIn ? "stats still to come in" : null,
                    !gw.motmAwarded ? "star players not awarded" : null,
                  ].filter(Boolean) as string[];
                  return (
                    <>
                    {(gw.stars?.length ?? 0) > 0 && (
                      <div className="mt-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
                          Star players — GW{gw.gwNumber}
                        </div>
                        <ol className="mt-1 space-y-0.5">
                          {(gw.stars ?? []).map((s, i) => (
                            <li key={s.playerId} className="flex items-center justify-between gap-3 text-xs">
                              <span className="min-w-0 truncate font-semibold text-foreground">
                                <span className="mr-1 text-amber-300">{i === 0 ? "★★★" : i === 1 ? "★★" : "★"}</span>
                                {i + 1}. {s.name}
                              </span>
                              <span className="font-bold tabular-nums text-amber-300">+{s.bonus} pts</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                <div className="font-semibold">Pre-season — no gameweek open yet</div>
                <div className="text-xs text-muted-foreground">Try out formations and squads now; you can save once the first gameweek opens.</div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
            {gw && (() => {
              const fs = (gw.fixtureStatus ?? "").toUpperCase();
              const finished = fs === "FINISHED" || gw.status === "final";
              const live = fs === "IN_PLAY" || fs === "LIVE" || fs === "PAUSED";
              const hasScore = gw.homeScore !== null && gw.awayScore !== null;
              const clock =
                fs === "PAUSED"
                  ? "HT"
                  : gw.minute != null
                    ? `${gw.minute}'${gw.minuteAdded ? `+${gw.minuteAdded}` : ""}`
                    : null;
              const pointsReady = finished && hasGwPoints;
              return (
                <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {live ? "Live score" : finished ? "Full time" : "Kick-off to come"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums text-foreground">
                        {hasScore ? `${gw.homeScore} — ${gw.awayScore}` : "– — –"}
                      </span>
                      {live && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 tabular-nums">
                          {clock ?? "LIVE"}
                        </span>
                      )}
                      {finished && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">FT</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span>{finished ? "Game is finished" : "Game not finished yet"}</span>
                    {finished ? (
                      <Check className="size-4 text-emerald-400" strokeWidth={3} />
                    ) : (
                      <X className="size-4 text-destructive" strokeWidth={3} />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span>{pointsReady ? "Points updated" : "Points waiting to be updated"}</span>
                    {pointsReady ? (
                      <Check className="size-4 text-emerald-400" strokeWidth={3} />
                    ) : (
                      <X className="size-4 text-destructive" strokeWidth={3} />
                    )}
                  </div>
                  {(() => {
                    const done = gw.finished === true;
                    const pending = [
                      !/FT|FULL|POST|FINAL/i.test(gw.fixtureStatus ?? "") && gw.status !== "final" ? "match not finished" : null,
                      !gw.statsIn ? "stats still to come in" : null,
                      !gw.motmAwarded ? "star players not awarded" : null,
                    ].filter(Boolean) as string[];
                    return (
                      <div
                        className={`mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                          done
                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                            : "border-destructive/50 bg-destructive/10 text-destructive"
                        }`}
                        title={done ? "All stats in and star players awarded" : `Waiting on: ${pending.join(", ")}`}
                      >
                        {done ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                        Gameweek {done ? "finished" : "in progress"}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            <Button
              onClick={handleSave}
              variant={dirty ? "default" : "outline"}
              className={
                "w-full " + (locked
                  ? "border-destructive/60 bg-destructive/10 text-destructive opacity-100"
                  : dirty && problems.length === 0
                    ? "bg-gradient-primary text-white shadow-glow ring-2 ring-primary/60 animate-pulse"
                    : dirty
                      ? ""
                      : "opacity-60")
              }
              title={locked ? "This gameweek is locked" : dirty ? undefined : "No changes to save"}
              disabled={saving || locked || !gw || !canPlay || !dirty || problems.length > 0}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : locked ? (
                <>
                  <Lock className="size-4 mr-2" /> Game Week Now Locked
                </>
              ) : !dirty ? (
                "Saved"
              ) : (
                "Save Matchday Squad"
              )}
            </Button>
          </div>
        </div>
    </div>
  );

  if (!canPlay) {
    return (
      <div className="overflow-hidden rounded-3xl border border-primary/30 shadow-glow bg-gradient-primary">
        <div className="grid items-center gap-0 md:grid-cols-2">
          <img
            src={fantasyBossAsset.url}
            alt="Middlesbrough manager sat at his office desk planning a team selection"
            loading="lazy"
            width={1280}
            height={720}
            className="h-full w-full object-cover"
          />
          <div className="p-6 md:p-8 space-y-4 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              Sign up today to enter — if you've got what it takes to be the Boro Boss
            </h2>
            <p className="text-sm text-muted-foreground">
              Name your match day 11, pick your bench, formation and captain. Join the game
              (or sign in as a guest) to start building your squad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">


      {locked && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
          <Lock className="size-4" /> This gameweek is locked. Changes will apply to the next one.
        </div>
      )}
      <div className="rounded-3xl border border-primary/30 shadow-glow bg-gradient-primary p-4 grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="grid min-w-0 gap-4 items-stretch h-full">
          <Tabs defaultValue="xi" className="min-w-0">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="xi">Match day 11</TabsTrigger>
              <TabsTrigger value="subs">Subs bench</TabsTrigger>
            </TabsList>
            <TabsContent value="xi" className="mt-3">
          <PitchView
              formation={formation}
              onFormationChange={(f) => setFormation(f)}
              editable={editable}
              dragEnabled={editable}
              playerById={playerById}
              selected={selected}
              starters={starters}
              slotPositions={slotPositions}
              onSlotPosition={(slotIndex, position) => {
                if (!editable) return;
                setSlotPositions((prev) => {
                  const next = [...prev];
                  next[slotIndex] = position;
                  return next;
                });
              }}
              bench={bench}
              captainId={captainId}
              viceId={viceId}
              pointsByPlayer={hasGwPoints ? pointsByPlayer : undefined}
              minutesByPlayer={minutesByPlayer.size ? minutesByPlayer : undefined}
              autoSubbedIds={autoSubbedIds}
              onSlotOpen={(positions, slotIndex, replaceId) => setPicker({ mode: "xi", positions, slotIndex, replaceId })}
              ratingByPlayer={ratingByPlayer.size ? ratingByPlayer : undefined}
              onDropStart={(playerId, slotIndex, replaceId) => {
                const p = playerById.get(playerId);
                if (p) startPlayer(p, slotIndex, replaceId);
              }}
              onBench={benchPlayer}
              onRemove={removePlayer}
              onCaptain={(id) => {
                setCaptainId(id);
                // A player can't wear both armbands.
                if (viceId === id) setViceId("");
              }}
              onVice={(id) => {
                setViceId(id);
                if (captainId === id) setCaptainId("");
              }}
              gw={gw}
          />
            </TabsContent>
            <TabsContent value="subs" className="mt-3">
              <BenchPanel
                variant="pitch"
                editable={editable}
                dragEnabled={editable}
                playerById={playerById}
                bench={bench}
                benchPositions={benchPositions}
                onBenchPosition={(index, pos) => {
                  if (!editable) return;
                  setBenchPositions((prev) => {
                    const next = [...prev];
                    while (next.length <= index) next.push(null);
                    next[index] = pos;
                    return next;
                  });
                }}
                benchSize={benchRules.size}
                pointsByPlayer={hasGwPoints ? pointsByPlayer : undefined}
                minutesByPlayer={minutesByPlayer.size ? minutesByPlayer : undefined}
                autoSubbedIds={autoSubbedIds}
                ratingByPlayer={ratingByPlayer.size ? ratingByPlayer : undefined}
                onDropStart={(playerId) => {
                  const p = playerById.get(playerId);
                  if (p) startPlayer(p);
                }}
                onDropBench={(playerId) => {
                  const p = playerById.get(playerId);
                  if (p) benchAdd(p);
                }}
                onRemove={removePlayer}
                onBenchSlotOpen={(benchIndex) => setPicker({ mode: "bench", benchIndex })}
                gw={gw}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Column 2 — your team card, checklist and the gameweek picker / save panel. */}
        <div className="grid min-w-0 gap-4 items-stretch h-full">
          <ManagerCard
            state={state}
            name={name}
            teamName={teamName}
            canEdit={canEdit}
            onEdit={onEdit}
            gameweekId={gwId}
            checklist={activeChecklist}
            locked={locked}
            canPlay={canPlay}
            swapCount={lineupSwapNotes.length}
            onOpenSwaps={() => setSwapDialogOpen(true)}
          />
          {gameweekPanel}
        </div>
      </div>

      <SwapHistoryDialog
        isMember={isMember}
        guestCreds={guestCreds}
        currentGameweekNumber={gw?.gwNumber}
        open={swapDialogOpen}
        onOpenChange={setSwapDialogOpen}
      />

      <PlayerPickerDialog
        open={!!picker}
        onOpenChange={(o) => { if (!o) setPicker(null); }}
        players={state.players}
        selected={selected}
        leagueGame={isLeagueGw}
        kickoffAt={gw ? gw.kickoffAt : null}
        positions={
          picker && picker.mode === "xi"
            ? picker.positions
            : picker && picker.mode === "bench" && picker.benchIndex === 0
              ? ["gk"]
              : undefined
        }
        title={
          picker && picker.mode === "xi"
            ? `Pick a ${picker.positions.map((p) => POSITION_LABEL[p] ?? POSITION_SHORT[p]).join(" or ")}`
            : picker && picker.mode === "bench" && picker.benchIndex === 0
              ? "Pick a replacement goalkeeper"
              : "Pick a substitute"
        }
        onPick={(p) => {
          if (!picker) return;
          if (picker.mode === "xi") startPlayer(p, picker.slotIndex, picker.replaceId);
          else benchAssign(p, picker.benchIndex);
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

/** Squad number badge, shown next to the player everywhere they appear. */
function ShirtNumber({ n, className = "" }: { n: number | null | undefined; className?: string }) {
  if (!n) return null;
  return (
    <span
      title={`Squad number ${n}`}
      className={`shrink-0 rounded-md border border-current/40 px-1 text-[10px] font-bold tabular-nums opacity-90 ${className}`}
    >
      {n}
    </span>
  );
}

/**
 * Senior (first-team) players who aren't on the club's official 25-man list.
 * Academy players are under the age limit, so they're always eligible.
 */
function outOf25(p: FantasyPlayerDTO): boolean {
  return (p.squadLevel ?? "first") === "first" && p.in25Squad === false;
}

/**
 * A senior player with no squad number isn't in the club's official squad, so
 * they can't be picked. Academy (U21/U18) players are exempt — they play
 * without a first-team number. New signings are exempt too: they appear on the
 * club's official 25-man list before a shirt number is handed out, so blocking
 * them would keep a brand-new arrival unpickable for weeks.
 */
function missingSquadNumber(p: FantasyPlayerDTO): boolean {
  if ((p.squadLevel ?? "first") !== "first") return false;
  if (p.shirtNumber) return false;
  return p.in25Squad !== true;
}

/**
 * Injuries are stamped with an expected return date. When picking a squad for a
 * future gameweek, a player whose return date falls on or before that kick-off
 * is expected back for that game — so we shouldn't scream OUT at the manager.
 *
 * A return date that has already been and gone counts as cleared too: the feed
 * lags behind reality, and a flag whose own return date is in the past must
 * never keep showing OUT.
 */
function injuryClearedBy(p: FantasyPlayerDTO, kickoffAt?: string | null): boolean {
  if ((p.injuryStatus ?? "none") === "none") return false;
  if (!p.injuryReturn) return false;
  const back = Date.parse(p.injuryReturn);
  if (!Number.isFinite(back)) return false;
  if (back <= Date.now()) return true;
  if (!kickoffAt) return false;
  const ko = Date.parse(kickoffAt);
  if (!Number.isFinite(ko)) return false;
  return back <= ko;
}

/**
 * Ruled out for this gameweek: flagged injured (or club status "injured") with
 * no return date on or before kick-off. These players cannot be picked at all.
 */
function injuredUnavailable(p: FantasyPlayerDTO, kickoffAt?: string | null): boolean {
  const flaggedOut = (p.injuryStatus ?? "none") === "out" || p.status === "injured";
  return flaggedOut && !injuryClearedBy(p, kickoffAt);
}

/** True when the player can't be added to a squad for this gameweek. */
function pickBlockedReason(p: FantasyPlayerDTO, kickoffAt?: string | null): string | null {
  if (missingSquadNumber(p)) return `${p.name} has no squad number — not in the official squad.`;
  if (injuredUnavailable(p, kickoffAt))
    return `${p.name} is injured and can't be picked${p.injuryNote ? ` (${p.injuryNote})` : ""}.`;
  return null;
}

/**
 * Injury / suspension flag. Shown on the pitch, bench and player picker.
 * Injured players stay selectable — the icon is a warning, not a block.
 */
function InjuryIcon({
  p,
  className = "",
  label = true,
  kickoffAt,
}: {
  p: FantasyPlayerDTO;
  className?: string;
  /** Show the wording next to the icon (off where the row already spells it out). */
  label?: boolean;
  /** Kick-off of the gameweek being picked — used to fade flags they're due back for. */
  kickoffAt?: string | null;
}) {
  const s = p.injuryStatus ?? "none";
  if (s === "none") return null;
  const cleared = injuryClearedBy(p, kickoffAt);
  if (cleared) {
    const t = `Due back ${p.injuryReturn} — expected available for this game${p.injuryNote ? ` (${p.injuryNote})` : ""}`;
    return (
      <span
        title={t}
        aria-label={t}
        className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border border-emerald-300 bg-emerald-600 px-1 py-[1px] text-[9px] font-extrabold uppercase leading-none tracking-wide text-white shadow-sm ${className}`}
      >
        <Check className="size-2.5" strokeWidth={3} />
        BACK
      </span>
    );
  }
  const bits = [
    s === "suspended" ? "Suspended" : s === "doubtful" ? "Doubtful" : "Injured — out",
    p.injuryNote || null,
    p.injuryReturn ? `Expected back: ${p.injuryReturn}` : null,
    p.injurySource === "admin" ? "(set by owner)" : p.injurySource === "feed" ? "(EFL Fantasy feed)" : null,
  ].filter(Boolean);
  const title = bits.join(" · ");
  const Icon = s === "suspended" ? Ban : s === "doubtful" ? AlertTriangle : Cross;
  const short = s === "suspended" ? "SUSP" : s === "doubtful" ? "DOUBT" : "OUT";
  // Loud, readable badge — a tooltip-only icon was too easy to miss.
  const tint =
    s === "doubtful"
      ? "bg-amber-500 text-black border-amber-300"
      : s === "suspended"
        ? "bg-rose-600 text-white border-rose-300"
        : "bg-red-600 text-white border-red-300";
  if (!label) {
    return (
      <span title={title} aria-label={title} className="inline-flex shrink-0 items-center">
        <Icon className={`size-3.5 ${s === "doubtful" ? "text-amber-400" : s === "suspended" ? "text-rose-400" : "text-red-500"} ${className}`} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1 py-[1px] text-[9px] font-extrabold uppercase leading-none tracking-wide shadow-sm ${tint} ${className}`}
    >
      <Icon className="size-2.5" strokeWidth={3} />
      {short}
    </span>
  );
}

/**
 * Pop-box player picker. Opened from an XI slot (filtered to that position) or a
 * bench slot (every remaining player), split into First team / U21 / U18 tabs.
 */
function PlayerPickerDialog({
  open, onOpenChange, players, selected, positions, title, onPick, leagueGame = true, kickoffAt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  players: FantasyPlayerDTO[];
  selected: string[];
  positions?: FantasyPosition[];
  title: string;
  onPick: (p: FantasyPlayerDTO) => void;
  /** League games only use the 25-man squad; cup ties are open to anyone. */
  leagueGame?: boolean;
  /** Kick-off of the gameweek being picked, so injuries they're due back for read as available. */
  kickoffAt?: string | null;
}) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<PickerLevel>("first");
  useEffect(() => { if (open) { setQ(""); setLevel("first"); } }, [open]);

  const pool = useMemo(() => {
    const term = q.trim().toLowerCase();
    return players
      .filter((p) => p.status !== "departed" && p.status !== "loaned_out")
      .filter((p) => !selected.includes(p.id))
      .filter((p) =>
        positions?.length ? playerPositions(p).some((pos) => positions.includes(pos)) : true,
      )
      .filter((p) => (term ? p.name.toLowerCase().includes(term) : true))
      .sort((a, b) =>
          POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
          (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0)
      );
  }, [players, selected, positions, q]);

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
            const blocked = pickBlockedReason(p, kickoffAt);
            return (
              <li key={p.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${blocked ? "opacity-60" : ""}`}>
                <span className={`text-[10px] font-bold rounded-md border px-1.5 py-0.5 ${POS_TINT[p.position]}`}>
                  {playerPositionLabel(p)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`truncate font-medium ${blocked ? "line-through decoration-2 decoration-red-500/80" : ""}`}>
                      {p.name}
                    </span>
                    <ShirtNumber n={p.shirtNumber} />
                    <InjuryIcon p={p} kickoffAt={kickoffAt} />
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
                    {(p.injuryStatus ?? "none") !== "none" && (injuryClearedBy(p, kickoffAt) ? (
                      <span className="ml-1 uppercase text-emerald-500">
                        due back {p.injuryReturn} · expected available
                      </span>
                    ) : (
                      <span className={`ml-1 uppercase ${p.injuryStatus === "doubtful" ? "text-amber-500" : "text-red-500"}`}>
                        {p.injuryStatus === "suspended" ? "suspended" : p.injuryStatus === "doubtful" ? "doubtful" : "injured"}
                        {p.injuryNote ? ` · ${p.injuryNote}` : ""}
                        {p.injuryReturn ? ` · back ${p.injuryReturn}` : ""}
                      </span>
                    ))}
                  </div>
                  {leagueGame && outOf25(p) && (
                    <div className="text-[10px] font-semibold uppercase leading-tight text-amber-500">
                      Not included in 25-man matchday squad
                    </div>
                  )}
                  {missingSquadNumber(p) && (
                    <div className="text-[10px] font-semibold uppercase leading-tight text-red-500 line-through decoration-red-500/70">
                      Not in the official squad — cannot be picked
                    </div>
                  )}
                  {!missingSquadNumber(p) && injuredUnavailable(p, kickoffAt) && (
                    <div className="mt-0.5 w-fit rounded-md border border-red-400 bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-wide text-white shadow-sm">
                      Injured — cannot be picked
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  disabled={!!blocked}
                  title={blocked ?? "Put in this slot"}
                  className="shrink-0 grid place-items-center size-7 rounded-lg border border-primary/50 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Plus className="size-3.5" />
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
  formation, onFormationChange, formationLocked = false, editable, dragEnabled = false, playerById, selected, starters, slotPositions, onSlotPosition, bench, captainId, viceId,
  pointsByPlayer, minutesByPlayer, autoSubbedIds, onDropStart, onBench, onRemove, onCaptain, onVice,
  onSlotOpen, gw, ratingByPlayer,
}: {
  formation: FormationKey;
  onFormationChange: (f: FormationKey) => void;
  formationLocked?: boolean;
  editable: boolean;
  /** Drag and drop is enabled while the gameweek is still open. */
  dragEnabled?: boolean;
  playerById: Map<string, FantasyPlayerDTO>;
  selected: string[];
  starters: (string | null)[];
  slotPositions?: (FantasyPosition | null)[];
  onSlotPosition?: (slotIndex: number, position: FantasyPosition) => void;
  bench: (string | null)[];
  captainId: string;
  viceId: string;
  pointsByPlayer?: Map<string, number | null>;
  minutesByPlayer?: Map<string, number | null>;
  autoSubbedIds?: Set<string>;
  ratingByPlayer?: Map<string, number>;
  onSlotOpen: (positions: FantasyPosition[], slotIndex: number, replaceId?: string) => void;
  onDropStart: (playerId: string, slotIndex?: number, replaceId?: string) => void;
  onBench: (id: string) => void;
  onRemove: (id: string) => void;
  onCaptain: (id: string) => void;
  onVice: (id: string) => void;
  gw?: FantasyGameweekDTO | null;
}) {
  const rows = formationRows(formation);
  /** 25-man squad restriction applies to league games only — cup ties are open. */
  const leagueGame = gw ? fantasyCompetitionGroup(gw.competition) === "league" : true;
  /** Kick-off of this gameweek — injuries with an earlier return date read as available. */
  const gwKickoff = gw ? gw.kickoffAt : null;

  // Starters are stored as a fixed-length array mapped directly to pitch slots
  // (row order, left-to-right). This keeps every player in the same slot when
  // another is removed, rather than sliding everyone across to fill the gap.
  let slotIdx = 0;
  const rowSlots: { positions: FantasyPosition[]; startIndex: number; slots: (string | null)[] }[] = rows.map((r) => {
    const slots = starters.slice(slotIdx, slotIdx + r.count);
    const startIndex = slotIdx;
    slotIdx += r.count;
    return { positions: rowPositions(r), startIndex, slots };
  });

  // Any selected player not currently assigned to a slot appears in the overflow row.
  const assigned = new Set([...starters.filter(Boolean), ...bench.filter(Boolean)] as string[]);
  const overflow = selected.filter((id) => !assigned.has(id));

  const dropProps = (handler: (playerId: string) => void) => ({
    onDragOver: (e: ReactDragEvent) => { if (dragEnabled) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: ReactDragEvent) => {
      if (!dragEnabled) return;
      e.preventDefault();
      const id = e.dataTransfer.getData("text/fantasy-player");
      if (id) handler(id);
    },
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden">
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
        <div className="pointer-events-none absolute right-5 top-5 sm:right-8 sm:top-8 z-10 w-32 sm:w-44 rounded-lg sm:rounded-xl border border-white/30 bg-slate-950/80 p-1.5 sm:p-2 shadow-lg backdrop-blur-sm">
          <div className="pointer-events-auto">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-white/80">Formation</label>
            <select
              className="h-7 sm:h-8 w-full min-w-0 rounded-lg border border-white/30 bg-slate-900/80 px-1.5 sm:px-2 text-[11px] sm:text-xs font-semibold text-white"
              value={formation}
              onChange={(e) => onFormationChange(e.target.value as FormationKey)}
              disabled={!editable || formationLocked}
            >
            {FORMATION_KEYS.map((f) => (
              <option key={f} value={f}>{f} — {FORMATIONS[f].label}</option>
            ))}
          </select>
            {formationLocked && (
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">Formation locked</p>
            )}
          </div>
        </div>
        {gw && !gw.dateTbc && (
          <div className="pointer-events-none absolute left-5 top-5 sm:left-8 sm:top-8 z-10 box-border w-28 max-w-[calc(50%-1.25rem)] overflow-hidden rounded-lg border border-white/30 bg-slate-950/80 p-1.5 sm:w-40 sm:max-w-[calc(50%-2rem)] sm:rounded-xl sm:p-2 shadow-lg backdrop-blur-sm">
            <DigitalLockCountdown
              lockAt={gw.lockAt}
              compact
            />
          </div>
        )}
        <div className="relative space-y-4 sm:space-y-6 py-2">
          {rowSlots.map((row, ri) => {
            // The keeper stays centred; outfield rows spread across the full pitch width.
            const isGkRow = row.positions.length === 1 && row.positions[0] === "gk";
            return (
            <div key={ri} className="flex w-full flex-nowrap items-stretch justify-evenly gap-1.5 sm:gap-3">
              {row.slots.map((id, si) => {
                const p = id ? playerById.get(id) : undefined;
                const slotIndex = row.startIndex + si;
                return (
                  <div
                    key={`${ri}-${si}`}
                    {...dropProps((dragged) => onDropStart(dragged, slotIndex, id ?? undefined))}
                    draggable={dragEnabled && !!id}
                    onDragStart={(e) => { if (id) e.dataTransfer.setData("text/fantasy-player", id); }}
                    onClick={() => { if (editable && !id) onSlotOpen(row.positions, slotIndex); }}
                    role={editable && !id ? "button" : undefined}
                    className={`min-w-0 flex-1 basis-0 max-w-[104px] sm:max-w-[132px] rounded-xl border border-y-white/20 px-1.5 py-2 text-center shadow-lg shadow-black/30 backdrop-blur-sm transition-all ${
                      isGkRow ? "" : ""
                    } ${
                      p
                        ? "border-l-[3px] border-r-[3px] border-l-white/35 border-r-white/35 bg-gradient-to-b from-slate-900/85 to-slate-950/90 ring-1 ring-inset ring-white/5 hover:border-l-white/55 hover:border-r-white/55"
                        : "cursor-pointer border-dashed border-l-2 border-r-2 border-l-white/40 border-r-white/40 bg-white/[0.07] hover:border-l-white/70 hover:border-r-white/70 hover:bg-white/[0.14]"
                    }`}
                  >
                    {p ? (
                      <>
                        <div className="flex items-center justify-center gap-1">
                          <Shirt className={`size-4 ${isGkRow ? "text-emerald-400" : "text-red-500"}`} />
                          <ShirtNumber n={p.shirtNumber} className="text-white" />
                          {captainId === p.id && <Crown className="size-3.5 text-amber-400" />}
                          {viceId === p.id && <Star className="size-3.5 text-sky-300" />}
                          <InjuryIcon p={p} kickoffAt={gwKickoff} />
                        </div>
                        <PlayerNameButton
                          playerId={p.id}
                          name={p.name}
                          gameweekNumber={gw?.gwNumber ?? null}
                          scoringAs={(() => {
                            const eligible = playerPositions(p).filter((pos) => row.positions.includes(pos));
                            const chosen = slotPositions?.[slotIndex] ?? null;
                            const explicit = chosen && eligible.includes(chosen) ? chosen : null;
                            return explicit ?? resolveSlotPosition(row.positions, p) ?? p.position;
                          })()}
                          className="mt-1 block text-center text-[10px] font-semibold leading-tight text-white break-words line-clamp-2 min-h-[24px]"
                        />
                        {ratingByPlayer?.has(p.id) && (
                          <div className="mt-0.5 flex items-center justify-center gap-1">
                            <span className="text-[8px] font-bold uppercase tracking-wide text-white/60">Rating</span>
                            <RatingPill rating={ratingByPlayer.get(p.id)} dark />
                          </div>
                        )}
                        {(() => {
                          // Two-position players are scored in the role of the slot
                          // they fill; on a flexible slot the manager must pick which.
                          const eligible = playerPositions(p).filter((pos) => row.positions.includes(pos));
                          const chosen = slotPositions?.[slotIndex] ?? null;
                          const explicit = chosen && eligible.includes(chosen) ? chosen : null;
                          const scoringAs = explicit ?? resolveSlotPosition(row.positions, p) ?? p.position;
                          if (eligible.length > 1 && editable && onSlotPosition) {
                             return (
                                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/60">Scores As (Please Select Scoring Position)</span>
                                 {eligible.map((pos) => (
                                  <button
                                    key={pos}
                                    type="button"
                                    title={`Score ${p.name} as a ${POSITION_LABEL[pos].toLowerCase()}`}
                                    onClick={() => onSlotPosition(slotIndex, pos)}
                                    className={`rounded border px-1 text-[9px] font-bold uppercase ${
                                      explicit === pos
                                        ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-100"
                                        : "border-white/30 bg-white/5 text-white/60 hover:text-white"
                                    }`}
                                  >
                                    {POSITION_SHORT[pos]}
                                  </button>
                                ))}
                              </div>
                            );
                          }
                          return editable ? (
                            <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-white/60">
                              {`Scores as ${POSITION_SHORT[scoringAs]}`}
                            </div>
                          ) : null;
                        })()}
                        {leagueGame && outOf25(p) && (
                          <div className="text-[9px] font-bold uppercase leading-tight text-amber-300">
                            Not in 25-man matchday squad
                          </div>
                        )}
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
                          <div className="mt-1 flex flex-col gap-0.5 sm:flex-row sm:gap-1 items-center justify-center">
                            <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                              <button type="button" title="Captain" onClick={() => onCaptain(p.id)} className={`rounded p-0.5 ${captainId === p.id ? "text-amber-400" : "text-white/50 hover:text-white"}`}>
                                <Crown className="size-2.5 sm:size-3" />
                              </button>
                              <button type="button" title="Vice-captain" onClick={() => onVice(p.id)} className={`rounded p-0.5 ${viceId === p.id ? "text-sky-300" : "text-white/50 hover:text-white"}`}>
                                <Star className="size-2.5 sm:size-3" />
                              </button>
                              <button type="button" title="Swap this player" onClick={() => onSlotOpen(row.positions, slotIndex, p.id)} className="rounded p-0.5 text-white/50 hover:text-white">
                                <ArrowRightLeft className="size-2.5 sm:size-3" />
                              </button>
                            </div>
                            <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                              <button type="button" title="Move to bench" onClick={() => onBench(p.id)} className="rounded p-0.5 text-white/50 hover:text-white">
                                <ArrowDown className="size-2.5 sm:size-3" />
                              </button>
                              <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-white/50 hover:text-destructive">
                                <X className="size-2.5 sm:size-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-2 text-[11px] font-semibold text-white/80">
                        <div className="mx-auto grid size-6 place-items-center rounded-full border border-white/50">
                          <Plus className="size-3" />
                        </div>
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/85">
                          {slotPositionLabel(row.positions)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })}
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
                    draggable={dragEnabled}
                    onDragStart={(e) => e.dataTransfer.setData("text/fantasy-player", id)}
                    className="min-w-[68px] max-w-[120px] flex-1 rounded-xl border border-white/40 bg-slate-950/70 px-1.5 py-2 text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className={`rounded-md border px-1 text-[10px] font-bold ${POS_TINT[p.position]}`}>{playerPositionLabel(p)}</span>
                      <ShirtNumber n={p.shirtNumber} className="text-white" />
                      <InjuryIcon p={p} kickoffAt={gwKickoff} />
                    </div>
                    <PlayerNameButton
                      playerId={p.id}
                      name={p.name}
                      gameweekNumber={gw?.gwNumber ?? null}
                      className="mt-1 block text-center line-clamp-2 min-h-[24px] break-words text-[10px] font-semibold leading-tight text-white"
                    />
                    {ratingByPlayer?.has(p.id) && (
                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        <span className="text-[8px] font-bold uppercase tracking-wide text-white/60">Rating</span>
                        <RatingPill rating={ratingByPlayer.get(p.id)} dark />
                      </div>
                    )}
                    {leagueGame && outOf25(p) && (
                      <div className="text-[9px] font-bold uppercase leading-tight text-amber-300">Not in 25-man matchday squad</div>
                    )}
                    {editable && (
                      <div className="mt-1 flex items-center justify-center gap-0.5 sm:gap-1">
                        <button type="button" title="Move to bench" onClick={() => onBench(p.id)} className="rounded p-0.5 text-white/60 hover:text-white">
                          <ArrowDown className="size-2.5 sm:size-3" />
                        </button>
                        <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-white/60 hover:text-destructive">
                          <X className="size-2.5 sm:size-3" />
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

    </div>
  );
}

/** Substitutes panel — lives beside the pitch so it can sit in its own column. */
function BenchPanel({
  editable, dragEnabled = false, playerById, bench, benchPositions, onBenchPosition, benchSize, pointsByPlayer, minutesByPlayer, autoSubbedIds,
  onDropStart, onDropBench, onRemove, onBenchSlotOpen, gw, ratingByPlayer, variant = "panel",
}: {
  editable: boolean;
  /** Drag and drop is enabled while the gameweek is still open. */
  dragEnabled?: boolean;
  playerById: Map<string, FantasyPlayerDTO>;
  bench: (string | null)[];
  benchPositions?: (FantasyPosition | null)[];
  onBenchPosition?: (index: number, pos: FantasyPosition) => void;
  benchSize: number;
  pointsByPlayer?: Map<string, number | null>;
  minutesByPlayer?: Map<string, number | null>;
  autoSubbedIds?: Set<string>;
  ratingByPlayer?: Map<string, number>;
  onDropStart: (playerId: string) => void;
  onDropBench: (playerId: string) => void;
  onRemove: (id: string) => void;
  onBenchSlotOpen: (benchIndex: number) => void;
  gw?: FantasyGameweekDTO | null;
  /** "pitch" renders the bench on a green pitch, matching the starting XI view. */
  variant?: "panel" | "pitch";
}) {
  const onPitch = variant === "pitch";
  const leagueGame = gw ? fantasyCompetitionGroup(gw.competition) === "league" : true;
  const gwKickoff = gw ? gw.kickoffAt : null;
  const dropProps = (handler: (playerId: string) => void) => ({
    onDragOver: (e: ReactDragEvent) => { if (dragEnabled) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: ReactDragEvent) => {
      if (!dragEnabled) return;
      e.preventDefault();
      const id = e.dataTransfer.getData("text/fantasy-player");
      if (id) handler(id);
    },
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/85 backdrop-blur overflow-hidden">
      <div
        className={onPitch ? "relative p-4 sm:p-6" : "p-3"}
        style={
          onPitch
            ? {
                background:
                  "repeating-linear-gradient(to bottom, oklch(0.34 0.09 152) 0 44px, oklch(0.31 0.09 152) 44px 88px)",
              }
            : undefined
        }
        {...dropProps(onDropBench)}
      >
        {onPitch && (
          <div className="pointer-events-none absolute inset-4 sm:inset-6 rounded-xl border-2 border-white/25" aria-hidden />
        )}
        <div className={`mb-2 text-xs font-bold uppercase tracking-wide ${onPitch ? "relative text-white/85" : "text-muted-foreground"}`}>
          Subs bench ({bench.filter(Boolean).length}/{benchSize})
        </div>
        <div className={`grid gap-2 ${onPitch ? "relative grid-cols-2 gap-3 py-2 sm:grid-cols-3" : "grid-cols-3"}`}>
          {Array.from({ length: Math.max(benchSize, bench.length) }, (_, i) => BENCH_SLOT_LABELS[i] ?? "Sub").map((slotLabel, i) => {
            const id = bench[i];
            const p = id ? playerById.get(id) : undefined;
            return (
              <div
                key={i}
                {...dropProps(onDropBench)}
                draggable={dragEnabled && !!id}
                onDragStart={(e) => { if (id) e.dataTransfer.setData("text/fantasy-player", id); }}
                onClick={() => { if (editable && !id) onBenchSlotOpen(i); }}
                role={editable && !id ? "button" : undefined}
                className={
                  onPitch
                    ? `rounded-xl border border-y-white/20 px-1.5 py-2.5 text-center text-xs shadow-lg shadow-black/30 backdrop-blur-sm transition-all ${
                        p
                          ? "border-l-[3px] border-r-[3px] border-l-white/35 border-r-white/35 bg-gradient-to-b from-slate-900/85 to-slate-950/90 text-white ring-1 ring-inset ring-white/5 hover:border-l-white/55 hover:border-r-white/55"
                          : "cursor-pointer border-dashed border-l-2 border-r-2 border-l-white/40 border-r-white/40 bg-white/[0.07] text-white/80 hover:border-l-white/70 hover:border-r-white/70 hover:bg-white/[0.14]"
                      }`
                    : `rounded-xl border px-1.5 py-2.5 text-center text-xs transition-colors ${
                        p
                          ? "border-l-[3px] border-r-[3px] border-l-primary/70 border-r-primary/70 bg-gradient-to-b from-muted/60 to-muted/30 shadow-sm"
                          : "cursor-pointer border-dashed border-l-[3px] border-r-[3px] border-l-border/60 border-r-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`
                }
              >
                <div className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${onPitch ? "text-white/70" : "text-muted-foreground/80"}`}>
                  {i === 0 ? "Sub GK" : `Sub ${i}`}
                </div>
                {p ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <Shirt className={`size-5 ${p.position === "gk" ? "text-emerald-400" : "text-red-500"}`} />
                      <ShirtNumber n={p.shirtNumber} className="text-[10px] font-black text-white border-white/60" />
                      <InjuryIcon p={p} kickoffAt={gwKickoff} />
                    </div>
                    <PlayerNameButton
                      playerId={p.id}
                      name={p.name}
                      gameweekNumber={gw?.gwNumber ?? null}
                      scoringAs={(() => {
                        const eligible = playerPositions(p);
                        const chosen = benchPositions?.[i] ?? null;
                        return (chosen && eligible.includes(chosen) ? chosen : null) ?? p.position;
                      })()}
                      asSub
                      className={`mt-1.5 block text-center text-[10px] font-semibold leading-tight break-words line-clamp-2 min-h-[24px] ${onPitch ? "text-white" : ""}`}
                    />
                    {ratingByPlayer?.has(p.id) && (
                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        <span className={`text-[8px] font-bold uppercase tracking-wide ${onPitch ? "text-white/60" : "text-muted-foreground"}`}>Rating</span>
                        <RatingPill rating={ratingByPlayer.get(p.id)} dark={onPitch} />
                      </div>
                    )}
                    {(() => {
                      // Subs are scored in the role they were named in; a
                      // two-position sub lets the manager choose which.
                      const eligible = playerPositions(p);
                      const chosen = benchPositions?.[i] ?? null;
                      const explicit = chosen && eligible.includes(chosen) ? chosen : null;
                      const scoringAs = explicit ?? p.position;
                      if (eligible.length > 1 && editable && onBenchPosition) {
                        return (
                          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/80">
                              Scores As (Please Select Scoring Position)
                            </span>
                            {eligible.map((pos) => (
                              <button
                                key={pos}
                                type="button"
                                title={`Score ${p.name} as a ${POSITION_LABEL[pos].toLowerCase()}`}
                                onClick={(e) => { e.stopPropagation(); onBenchPosition(i, pos); }}
                                className={`rounded border px-1 text-[9px] font-bold uppercase ${
                                  explicit === pos
                                    ? "border-emerald-500/70 bg-emerald-500/20 text-emerald-400"
                                    : "border-border/70 bg-muted/30 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {POSITION_SHORT[pos]}
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return editable ? (
                        <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/80">
                          {`Scores as ${POSITION_SHORT[scoringAs]}`}
                        </div>
                      ) : null;
                    })()}
                    {leagueGame && outOf25(p) && (
                      <div className="text-[9px] font-bold uppercase leading-tight text-amber-500">Not in 25-man matchday squad</div>
                    )}
                    {pointsByPlayer?.has(p.id) && (
                      <div className="mt-1 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-1.5 text-[10px] font-bold tabular-nums text-emerald-400">
                        {pointsByPlayer.get(p.id) ?? 0} pts
                      </div>
                    )}
                    {minutesByPlayer?.has(p.id) && (
                      <div className={`mt-0.5 text-[10px] font-semibold tabular-nums ${onPitch ? "text-white/75" : "text-muted-foreground"}`}>
                        {(minutesByPlayer.get(p.id) ?? 0) > 0 ? `${minutesByPlayer.get(p.id)}′ played` : "Didn't play"}
                      </div>
                    )}
                    {autoSubbedIds?.has(p.id) && (
                      <div className="mt-0.5 text-[9px] font-bold uppercase text-sky-400">Subbed on</div>
                    )}
                    {editable && (
                      <div className="mt-1.5 flex items-center justify-center gap-0.5 sm:gap-1">
                        <button type="button" title="Into the XI" onClick={() => onDropStart(p.id)} className="rounded p-0.5 text-muted-foreground hover:text-emerald-400">
                          <ArrowUp className="size-2.5 sm:size-3" />
                        </button>
                        <button type="button" title="Remove" onClick={() => onRemove(p.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                          <X className="size-2.5 sm:size-3" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-2 font-semibold">
                    <div className="mx-auto grid size-8 place-items-center rounded-lg bg-muted/30 border border-border/70">
                      <Plus className="size-4" />
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {i === 0 ? "GK" : "ANY"}
                    </div>
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
                {pl ? playerPositionLabel(pl) : POSITION_SHORT["mid"]}
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
            <div className="w-14 text-xs font-bold text-primary">
              GW{g.gwNumber}
              {g.dateTbc && <span className="block text-[10px] font-bold uppercase text-sky-300">TBC</span>}
            </div>
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
                {gwDateLabel(g)} · {g.competition}
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
  // Postponed ties sit in their own block at the bottom until a new date is confirmed.
  const scheduled = items.filter((g) => !isPostponedGw(g));
  const postponed = items.filter((g) => isPostponedGw(g));
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
        <div className="space-y-2">
          {scheduled.map(renderGw)}
          {postponed.length > 0 && (
            <div className="space-y-2 pt-2">
              <h5 className="flex items-center gap-2 border-t border-amber-400/30 pt-3 text-xs font-bold uppercase tracking-wide text-amber-300">
                Postponed — awaiting new date
                <span className="font-normal normal-case text-muted-foreground">{postponed.length}</span>
              </h5>
              {postponed.map(renderGw)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}




// ------------------------------------------------------------------
// Leaderboard + scoring
// ------------------------------------------------------------------
function LeaderboardTable({
  rows,
  gameweeks = [],
  previousGameweek,
  canRemove = false,
  onRemove,
}: {
  rows: FantasyLeaderboardRow[];
  gameweeks?: FantasyGameweekDTO[];
  previousGameweek?: FantasyPreviousGwScoreDTO | null;
  canRemove?: boolean;
  onRemove?: (row: FantasyLeaderboardRow) => Promise<void>;
}) {
  // Admin/management only: confirm before a manager is taken off the board.
  const [pending, setPending] = useState<FantasyLeaderboardRow | null>(null);
  const [removing, setRemoving] = useState(false);
  // Squad viewer: only gameweeks that have already locked can be inspected.
  const [viewing, setViewing] = useState<FantasyLeaderboardRow | null>(null);
  const lockedGws = useMemo(
    () =>
      gameweeks
        .filter((g) => g.status !== "upcoming" || new Date(g.lockAt).getTime() <= Date.now())
        .sort((a, b) => b.gwNumber - a.gwNumber),
    [gameweeks],
  );
  const confirmRemove = async () => {
    if (!pending || !onRemove) return;
    setRemoving(true);
    try {
      await onRemove(pending);
      toast.success(`${pending.teamName || pending.displayName || "Manager"} removed from the game.`);
      setPending(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove that manager.");
    } finally {
      setRemoving(false);
    }
  };
  const removeButton = (r: FantasyLeaderboardRow) =>
    canRemove ? (
      <td className="px-2 py-2 text-right">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 text-destructive hover:bg-destructive/10"
          title="Remove this manager from the game"
          aria-label={`Remove ${r.teamName || r.displayName || "manager"} from the game`}
          onClick={() => setPending(r)}
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    ) : null;
  const squadCell = (r: FantasyLeaderboardRow) => (
    <td className="px-3 py-2 text-right">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={!lockedGws.length}
        title={lockedGws.length ? "View this manager's squad for a locked gameweek" : "No gameweeks have locked yet"}
        onClick={() => setViewing(r)}
      >
        <Users className="size-3.5" />
        Squad
      </Button>
    </td>
  );
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
  const previousPoints = new Map(
    (previousGameweek?.rows ?? []).map((row) => [`${row.isGuest ? "guest" : "user"}:${row.entrantId}`, row.points]),
  );
  const previousPointsFor = (row: FantasyLeaderboardRow) => {
    if (row.previousGwPoints != null) return row.previousGwPoints;
    return previousPoints.get(`${row.isGuest ? "guest" : "user"}:${row.entrantId}`) ?? "—";
  };
  const currentPointsFor = (row: FantasyLeaderboardRow) => row.currentGwPoints ?? "—";
  const currentGwNumber = rows.find((r) => r.currentGwNumber != null)?.currentGwNumber ?? null;
  const previousGwNumber =
    rows.find((r) => r.previousGwNumber != null)?.previousGwNumber ?? previousGameweek?.gameweek.gwNumber ?? null;
  const pointsCells = (r: FantasyLeaderboardRow) => (
    <>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{previousPointsFor(r)}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{currentPointsFor(r)}</td>
    </>
  );
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 w-10">#</th>
            <th className="text-left px-3 py-2">Manager</th>
            <th className="text-right px-3 py-2">GWs</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">
              Previous GW{previousGwNumber != null ? ` ${previousGwNumber}` : ""}
            </th>
            <th className="text-right px-3 py-2 whitespace-nowrap">
              This week{currentGwNumber != null ? ` (GW ${currentGwNumber})` : ""}
            </th>
            <th className="text-right px-3 py-2">Season points</th>
            <th className="text-right px-3 py-2">Squad</th>
            {canRemove && <th className="px-2 py-2 w-10 sr-only">Remove</th>}
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
              {pointsCells(r)}

              <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">{r.totalPoints}</td>
              {squadCell(r)}
              {removeButton(r)}
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
              {pointsCells(r)}

              <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">{r.totalPoints}</td>
              {squadCell(r)}
              {removeButton(r)}
            </tr>
          ))}
        </tbody>
      </table>
      {ownerRows.length > 0 && (
        <p className="border-t border-border/50 bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
          Site owner plays for fun and is not ranked or eligible for prizes.
        </p>
      )}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !removing) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this manager?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  <span className="font-semibold text-foreground">{pending.teamName || "Unnamed FC"}</span>
                  {" — "}
                  {pending.displayName || pending.username || "Guest"}
                  {pending.isGuest ? " (guest)" : ""} will be deleted from MFC Fantasy Manager, along with
                  their squads, transfers and {pending.totalPoints} points. This can't be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep manager</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => { e.preventDefault(); void confirmRemove(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="size-4 animate-spin" /> : "Remove manager"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EntrantSquadDialog
        row={viewing}
        gameweeks={lockedGws}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

/** View a rival manager's squad for any gameweek that has already locked. */
function EntrantSquadDialog({
  row,
  gameweeks,
  onClose,
}: {
  row: FantasyLeaderboardRow | null;
  gameweeks: FantasyGameweekDTO[];
  onClose: () => void;
}) {
  const squadFn = useServerFn(getEntrantFantasySquad);
  const [gwId, setGwId] = useState<string>("");
  useEffect(() => {
    if (row) setGwId(gameweeks[0]?.id ?? "");
  }, [row, gameweeks]);

  const query = useQuery<EntrantSquadViewDTO>({
    queryKey: ["fantasy-entrant-squad", row?.entrantId ?? null, gwId],
    queryFn: () =>
      squadFn({ data: { entrantId: row!.entrantId, isGuest: row!.isGuest, gameweekId: gwId } }),
    enabled: !!row && !!gwId,
    staleTime: 10_000,
  });

  const gw = gameweeks.find((g) => g.id === gwId) ?? null;
  const data = query.data;
  const starters = (data?.picks ?? []).filter((p) => p.isStarter);
  const bench = (data?.picks ?? []).filter((p) => !p.isStarter);

  const pickRow = (p: EntrantSquadViewDTO["picks"][number], idx: number) => (
    <li key={p.playerId} className="flex items-center gap-2 border-t border-border/40 px-3 py-2 first:border-t-0">
      <span className="w-5 text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
      <Shirt className={`size-4 shrink-0 ${p.position === "gk" ? "text-emerald-400" : "text-red-500"}`} />
      <span className="w-7 text-xs tabular-nums text-muted-foreground">
        {p.shirtNumber ? `#${p.shirtNumber}` : "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
      {p.isCaptain && <Crown className="size-3.5 text-amber-400" aria-label="Captain" />}
      {p.isVice && <Star className="size-3.5 text-sky-400" aria-label="Vice captain" />}
      {p.autoSubbed && (
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">SUB IN</span>
      )}
      <span className="w-14 shrink-0 text-right text-[11px] uppercase text-muted-foreground">
        {POSITION_SHORT[(p.pickedPosition ?? p.position) as FantasyPosition]}
      </span>
      <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-primary">
        {p.points ?? "—"}
      </span>
    </li>
  );

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-full w-full h-screen max-h-screen rounded-none p-0 flex flex-col">
        <div className="flex flex-col h-full overflow-hidden">
          <DialogHeader className="px-4 pt-6 pb-2 shrink-0">
            <DialogTitle className="text-xl">{row?.teamName || "Unnamed FC"} — match day squad</DialogTitle>
            <DialogDescription>
              {row?.displayName || row?.username || "Guest"} · squads are only visible once the gameweek has locked.
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-2 shrink-0">
            <Select value={gwId} onValueChange={setGwId}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Choose a locked gameweek" />
              </SelectTrigger>
              <SelectContent position="item-aligned" className="z-[130] max-h-72">
                {gameweeks.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    GW{g.gwNumber} — {g.homeTeam} v {g.awayTeam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin" /></div>
            ) : query.error ? (
              <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                {(query.error as any)?.message ?? "Could not load that squad."}
              </p>
            ) : !data?.found ? (
              <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                No squad was submitted for {gw ? `GW${gw.gwNumber}` : "this gameweek"}.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                    Formation {data.formation ?? "—"}
                  </span>
                  <span>
                    Hits <span className="font-bold tabular-nums">{data.transferCost}</span> · Points{" "}
                    <span className="font-bold tabular-nums text-primary">{data.points ?? "—"}</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Starting 11</p>
                    <ul className="rounded-lg border border-border/60 bg-card/60">{starters.map(pickRow)}</ul>
                  </div>
                  {bench.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bench</p>
                      <ul className="rounded-lg border border-border/60 bg-card/60">{bench.map(pickRow)}</ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviousGameweekTable({ data }: { data: FantasyPreviousGwScoreDTO | null | undefined }) {
  const [viewing, setViewing] = useState<FantasyPreviousGwScoreDTO["rows"][number] | null>(null);
  const squadFn = useServerFn(getEntrantFantasySquad);
  const squadQuery = useQuery<EntrantSquadViewDTO>({
    queryKey: ["fantasy-previous-gw-squad", viewing?.entrantId ?? null, viewing?.gameweekId ?? null],
    queryFn: () =>
      squadFn({
        data: {
          entrantId: viewing!.entrantId,
          isGuest: viewing!.isGuest,
          gameweekId: viewing!.gameweekId,
        },
      }),
    enabled: !!viewing,
    staleTime: 10_000,
  });

  if (!data) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/80 p-6 text-sm text-muted-foreground">
        No gameweek has been finalised yet. Check back after the next match.
      </div>
    );
  }

  const { gameweek, rows } = data;
  const gwLabel = `GW${gameweek.gwNumber} — ${gameweek.homeTeam} v ${gameweek.awayTeam}`;

  const pickRow = (p: EntrantSquadViewDTO["picks"][number], idx: number) => (
    <li key={p.playerId} className="flex items-center gap-2 border-t border-border/40 px-3 py-2 first:border-t-0">
      <span className="w-5 text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
      <Shirt className={`size-4 shrink-0 ${p.position === "gk" ? "text-emerald-400" : "text-red-500"}`} />
      <span className="w-7 text-xs tabular-nums text-muted-foreground">
        {p.shirtNumber ? `#${p.shirtNumber}` : "—"}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
      {p.isCaptain && <Crown className="size-3.5 text-amber-400" aria-label="Captain" />}
      {p.isVice && <Star className="size-3.5 text-sky-400" aria-label="Vice captain" />}
      {p.autoSubbed && (
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">SUB IN</span>
      )}
      <span className="w-14 shrink-0 text-right text-[11px] uppercase text-muted-foreground">
        {POSITION_SHORT[(p.pickedPosition ?? p.position) as FantasyPosition]}
      </span>
      <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-primary">
        {p.points ?? "—"}
      </span>
    </li>
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur overflow-hidden">
      <div className="border-b border-border/60 bg-muted/40 px-4 py-3">
        <h3 className="font-display text-lg font-bold">Previous gameweek</h3>
        <p className="text-xs text-muted-foreground">{gwLabel}</p>
      </div>
      {!rows.length ? (
        <div className="p-6 text-sm text-muted-foreground">No squads were entered for {gwLabel}.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-10">#</th>
              <th className="text-left px-3 py-2">Manager</th>
              <th className="text-right px-3 py-2">Points</th>
              <th className="text-right px-3 py-2">Squad</th>
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
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">
                  {r.points ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setViewing(r)}
                  >
                    <Users className="size-3.5" /> Squad
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.teamName || "Unnamed FC"} — match day squad</DialogTitle>
            <DialogDescription>
              {viewing?.displayName || viewing?.username || "Guest"} · {gwLabel}
            </DialogDescription>
          </DialogHeader>
          {squadQuery.isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>
          ) : squadQuery.error ? (
            <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              {(squadQuery.error as any)?.message ?? "Could not load that squad."}
            </p>
          ) : !squadQuery.data?.found ? (
            <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              No squad was submitted for {gwLabel}.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                  Formation {squadQuery.data.formation ?? "—"}
                </span>
                <span>
                  Points{" "}
                  <span className="font-bold tabular-nums text-primary">{squadQuery.data.points ?? "—"}</span>
                </span>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Starting 11</p>
                <ul className="rounded-lg border border-border/60 bg-card/60">
                  {squadQuery.data.picks.filter((p) => p.isStarter).map(pickRow)}
                </ul>
              </div>
              {squadQuery.data.picks.some((p) => !p.isStarter) && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bench</p>
                  <ul className="rounded-lg border border-border/60 bg-card/60">
                    {squadQuery.data.picks.filter((p) => !p.isStarter).map(pickRow)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
        <p className="text-sm text-white/85 mt-1">Everything you need to know before you pick your Middlesbrough side. No budget, no player prices, no transfer limits — just pick the best Boro team every gameweek.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: "Match day", v: "11 players" },
            { k: "Bench", v: `${FANTASY_BENCH_SIZE} subs (Sub 1 = GK)` },
            { k: "Deadline", v: `${FANTASY_LOCK_MINUTES / 60} hours pre-KO` },
            { k: "Subs score", v: "Half points" },
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
          You name {FANTASY_BENCH_SIZE} subs in every competition, for a {FANTASY_SQUAD_SIZE}-man squad. Sub 1 is reserved for
          your replacement goalkeeper; the rest of the bench is entirely your call, with no other position cover required.
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
          ESPN supplies the available player match stats, such as goals, assists, shots, saves and goals conceded. Our game then
          combines those stats with its own scoring rules for appearances, substitutes, captains, clean sheets, penalties, cards,
          own goals and bonuses. Points are updated once the fixture has finished and all stats and bonuses have been confirmed.
          Only Middlesbrough players score, and only in competitive fixtures. Where you named the player decides the rate: anyone in
          your match day 11 who features earns 2 points for the appearance plus the full points for every match stat, while a sub who
          comes off your bench earns 1 point plus half points for every stat, no matter how many minutes he plays. Starters who don't
          get on and unused subs score 0. Only five subs can score: if more than five of your subs feature, the five who played the most
          minutes earn the points and any other sub is locked at 0 for that gameweek. Minutes only matter for clean sheets, where 60+ minutes pays more
          than under 60 minutes.
          Your captain scores double, and if he doesn't play a minute the vice-captain
          doubles instead. Players who cover two positions score in the position you selected for them.
        </p>
      </div>
      <Tabs defaultValue="starters">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="starters">Match day 11</TabsTrigger>
          <TabsTrigger value="subs">Subs</TabsTrigger>
        </TabsList>
        <TabsContent value="starters" className="mt-4">
          <ScoringBreakdown column="starter" note="Points for players named in your match day 11. A starter who doesn't get on the pitch scores 0. ESPN match stats and the game's own scoring rules are combined once the fixture is finished and all stats and bonuses have been confirmed." />
        </TabsContent>
        <TabsContent value="subs" className="mt-4">
          <ScoringBreakdown column="sub" note="Points for players who come off your bench: 1 point for getting on, then half points for every match stat. The stat points are added up first, then halved and rounded. Only five subs score — if more than five feature, the five who played the most minutes count, any other sub is locked at 0, and unused subs score 0." />
        </TabsContent>
      </Tabs>
      <div className="text-sm text-muted-foreground">
        Formations, bench rules and the deadline all live on the <span className="font-semibold text-foreground">Game rules</span> tab.
      </div>
    </div>
  );
}

function ScoringBreakdown({
  column,
  note,
}: {
  column: "starter" | "sub";
  note: string;
}) {
  const rows = SCORING_RULES.filter((r) => {
    const value = column === "starter" ? r.starter : r.sub;
    const included = value.trim() !== "—" && value.trim() !== "";
    if (column === "sub" && r.label.startsWith("Captain (vice")) return false;
    return included;
  }).map((r) => ({ abbr: r.abbr, label: r.label, minTime: r.minTime, points: column === "starter" ? r.starter : r.sub }));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/60">
              <th className="py-2 pr-3 font-semibold">Abbr</th>
              <th className="py-2 pr-3 font-semibold">Action</th>
              <th className="py-2 px-3 font-semibold whitespace-nowrap">Min game time</th>
              <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((r) => (
              <tr key={`${r.abbr}-${r.label}`}>
                <td className="py-2 pr-3"><AbbrChip abbr={r.abbr} title={r.label} /></td>
                <td className="py-2 pr-3">{r.label}</td>
                <td className="py-2 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{r.minTime}</td>
                <td className="py-2 pl-3 text-right font-bold tabular-nums text-primary">{r.points}</td>
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

/**
 * Swap history data hook shared by the panel and the dialog.
 */
function useSwapHistory(
  isMember: boolean,
  guestCreds: { email: string; pin: string } | null,
) {
  const memberFn = useServerFn(getFantasySwapHistory);
  const guestFn = useServerFn(getGuestFantasySwapHistory);
  return useQuery<FantasySwapHistoryRow[]>({
    queryKey: ["fantasy-swap-history", isMember ? "member" : guestCreds?.email ?? "none"],
    queryFn: () =>
      isMember
        ? memberFn({})
        : guestCreds
          ? guestFn({ data: { email: guestCreds.email, pin: guestCreds.pin } })
          : Promise.resolve([]),
    enabled: isMember || !!guestCreds,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Renders the grouped swap history rows.
 */
function SwapHistoryList({ rows }: { rows: FantasySwapHistoryRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, FantasySwapHistoryRow[]>();
    for (const r of rows) {
      const key = `${r.gameweek}|${r.swappedAt}`;
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, list }));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No automatic swaps recorded for this gameweek.</p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ key, list }) => {
        const first = list[0]!;
        return (
          <div key={key} className="rounded-lg border border-sky-400/30 bg-background/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-sky-200">
                GW{first.gameweek} — {first.fixture}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Swapped {new Date(first.swappedAt).toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
            <ul className="mt-2 space-y-2">
              {list.map((r) => (
                <li key={r.id} className="text-xs">
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        r.direction === "in"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {r.direction === "in" ? "In" : "Out"}
                    </span>
                    <span className="font-semibold">{r.playerName}</span>
                    <span className="text-muted-foreground">
                      · scores as {POSITION_SHORT[r.scoringPosition]}
                    </span>
                  </span>
                  <div className="mt-0.5 text-muted-foreground">{r.note}</div>
                  <div className="mt-0.5 text-[11px] italic text-sky-200/80">
                    <span className="font-semibold not-italic">Rule:</span> {r.rule}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Swap history popup dialog opened from the Your team box.
 */
function SwapHistoryDialog({
  isMember, guestCreds, currentGameweekNumber, open, onOpenChange,
}: {
  isMember: boolean;
  guestCreds: { email: string; pin: string } | null;
  currentGameweekNumber?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useSwapHistory(isMember, guestCreds);
  const rows = useMemo(
    () =>
      currentGameweekNumber != null
        ? (query.data ?? []).filter((r) => r.gameweek === currentGameweekNumber)
        : (query.data ?? []),
    [query.data, currentGameweekNumber],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="size-5 text-sky-300" /> Automatic line-up swaps
          </DialogTitle>
          <DialogDescription>
            When Boro's official starting eleven is announced, bench players who are starting are swapped
            into your eleven for picked starters who aren't — like for like only.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your swap history…
          </div>
        ) : (
          <SwapHistoryList rows={rows} />
        )}
      </DialogContent>
    </Dialog>
  );
}

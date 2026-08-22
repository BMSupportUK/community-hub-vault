import type { FotmobEventDetail } from "@/lib/fotmob-boro.types";

// Shared, pure normalisers for ESPN soccer summary (Gamecast) payloads.
// Used by both the match centre UI feed and the forum auto-poster so the two
// can never disagree about what happened in a game.

export type EspnEventKind =
  | "goal"
  | "own-goal"
  | "penalty"
  | "penalty-missed"
  | "yellow"
  | "red"
  | "sub"
  | "var"
  | "period"
  | "shootout-scored"
  | "shootout-missed"
  | "other";

export type EspnMatchEvent = {
  key: string;
  kind: EspnEventKind;
  clock: string | null;
  period: number | null;
  teamId: string | null;
  teamName: string | null;
  players: string[];
  playerIn: string | null;
  playerOut: string | null;
  assist: string | null;
  /** Full narrative sentence from ESPN when available. */
  text: string;
  /** Short headline, e.g. "Sammie Szmodics Goal - Volley". */
  shortText: string;
  shootout: boolean;
  scoringPlay: boolean;
  homeScore: number | null;
  awayScore: number | null;
  /** FotMob presentation detail (shot type, xG, shirt numbers, narrative). */
  detail?: FotmobEventDetail | null;
};

export type EspnNormalised = {
  events: EspnMatchEvent[];
  homeTeamId: string | null;
  awayTeamId: string | null;
  home: string | null;
  away: string | null;
  status: string | null;
  clock: string | null;
  source: "keyEvents" | "details" | "none";
};

const PERIOD_TYPES = new Set([
  "kickoff",
  "halftime",
  "fulltime",
  "start-2nd-half",
  "end-regular-time",
  "end-first-half-extra-time",
  "start-first-half-extra-time",
  "start-second-half-extra-time",
  "end-extra-time",
  "full-time",
  "end-of-game",
  "penalty-shootout-start",
]);

function typeKey(d: any): string {
  return String(d?.type?.type ?? d?.type?.text ?? "").toLowerCase();
}

export function classifyEspnEvent(d: any): EspnEventKind {
  const t = typeKey(d);
  const text = String(d?.type?.text ?? d?.shortText ?? "").toLowerCase();
  const shootout = !!d?.shootout;

  if (shootout) {
    if (d?.scoringPlay) return "shootout-scored";
    return "shootout-missed";
  }
  if (d?.ownGoal || t.includes("own-goal") || text.includes("own goal")) return "own-goal";
  if (t.includes("penalty") && (t.includes("miss") || t.includes("saved"))) return "penalty-missed";
  if (d?.penaltyKick && d?.scoringPlay) return "penalty";
  if (d?.penaltyKick && d?.scoringPlay === false) return "penalty-missed";
  if (t.includes("penalty") && d?.scoringPlay) return "penalty";
  if (d?.scoringPlay || t.startsWith("goal") || text.includes("goal")) return "goal";
  if (d?.redCard || t.includes("red-card") || text.includes("red card")) return "red";
  if (d?.yellowCard || t.includes("yellow-card") || text.includes("yellow card")) return "yellow";
  if (t.includes("substitution") || text.includes("substitution")) return "sub";
  if (t.includes("var") || text.includes("var decision")) return "var";
  if (PERIOD_TYPES.has(t)) return "period";
  return "other";
}

export function isMatchAction(kind: EspnEventKind): boolean {
  return kind !== "other" && kind !== "period";
}

export function isReportableEvent(kind: EspnEventKind): boolean {
  return (
    kind === "goal" ||
    kind === "own-goal" ||
    kind === "penalty" ||
    kind === "penalty-missed" ||
    kind === "yellow" ||
    kind === "red" ||
    kind === "sub"
  );
}

/** "Goal! Derby County 1, Sheffield United 0. …" -> [1, 0] */
function scoreFromNarrative(text: string): [number, number] | null {
  const m = text.match(/^[^!]*!\s*(.+?)\s+(\d+),\s*(.+?)\s+(\d+)[.,]/);
  if (!m) return null;
  const h = Number(m[2]);
  const a = Number(m[4]);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return [h, a];
}

function clockLabel(d: any): string | null {
  const base = d?.clock?.displayValue ? String(d.clock.displayValue) : null;
  if (!base) return null;
  const added = d?.addedClock?.displayValue ? `+${d.addedClock.displayValue}` : "";
  return added && !base.includes("+") ? `${base}${added}` : base;
}

function mapOne(d: any, index: number, nameFor: (id: string | null) => string | null): EspnMatchEvent {
  const kind = classifyEspnEvent(d);
  const players = (d?.participants ?? [])
    .map((p: any) => p?.athlete?.displayName)
    .filter(Boolean) as string[];
  const text = String(d?.text ?? d?.type?.text ?? "");
  const shortText = String(d?.shortText ?? d?.type?.text ?? "");
  const running = text ? scoreFromNarrative(text) : null;

  return {
    key: String(d?.id ?? d?.sequence ?? `idx-${index}`),
    kind,
    clock: clockLabel(d),
    period: d?.period?.number != null ? Number(d.period.number) : null,
    teamId: d?.team?.id != null ? String(d.team.id) : null,
    teamName: nameFor(d?.team?.id != null ? String(d.team.id) : null),
    players,
    playerIn: kind === "sub" ? (players[0] ?? null) : null,
    playerOut: kind === "sub" ? (players[1] ?? null) : null,
    assist: kind === "goal" || kind === "penalty" ? (players[1] ?? null) : null,
    text: text || shortText,
    shortText,
    shootout: !!d?.shootout,
    scoringPlay: !!d?.scoringPlay,
    detail: (d?.fotmob ?? null) as FotmobEventDetail | null,
    homeScore: running ? running[0]! : d?.homeScore != null ? Number(d.homeScore) : null,
    awayScore: running ? running[1]! : d?.awayScore != null ? Number(d.awayScore) : null,
  };
}

export function normaliseEspnSummary(json: any): EspnNormalised {
  const comp = json?.header?.competitions?.[0];
  const competitors: any[] = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c?.homeAway === "home") ?? competitors[0];
  const awayC = competitors.find((c) => c?.homeAway === "away") ?? competitors[1];
  const homeTeamId = homeC?.team?.id != null ? String(homeC.team.id) : null;
  const awayTeamId = awayC?.team?.id != null ? String(awayC.team.id) : null;
  const nameFor = (id: string | null) => {
    if (!id) return null;
    const c = competitors.find((x) => String(x?.team?.id ?? "") === id);
    return c?.team?.displayName ?? null;
  };

  const keyEvents: any[] = Array.isArray(json?.keyEvents) ? json.keyEvents : [];
  const details: any[] = Array.isArray(comp?.details) ? comp.details : [];
  const raw = keyEvents.length ? keyEvents : details;
  const source: EspnNormalised["source"] = keyEvents.length ? "keyEvents" : details.length ? "details" : "none";

  const events = raw.map((d, i) => mapOne(d, i, nameFor));

  // Fill in a running score for goals when ESPN gives no narrative.
  let h = 0;
  let a = 0;
  for (const ev of events) {
    if (ev.shootout) continue;
    const isGoal = ev.kind === "goal" || ev.kind === "penalty" || ev.kind === "own-goal";
    if (!isGoal) continue;
    let scoringSide: "home" | "away" | null = null;
    if (ev.teamId && homeTeamId && ev.teamId === homeTeamId) scoringSide = ev.kind === "own-goal" ? "away" : "home";
    else if (ev.teamId && awayTeamId && ev.teamId === awayTeamId) scoringSide = ev.kind === "own-goal" ? "home" : "away";
    if (ev.homeScore != null && ev.awayScore != null) {
      h = ev.homeScore;
      a = ev.awayScore;
      continue;
    }
    if (scoringSide === "home") h += 1;
    if (scoringSide === "away") a += 1;
    ev.homeScore = h;
    ev.awayScore = a;
  }

  return {
    events,
    homeTeamId,
    awayTeamId,
    home: homeC?.team?.displayName ?? null,
    away: awayC?.team?.displayName ?? null,
    status:
      comp?.status?.type?.shortDetail ??
      comp?.status?.type?.detail ??
      comp?.status?.type?.description ??
      null,
    clock: comp?.status?.displayClock ?? null,
    source,
  };
}

/** Human sentence for a single event (used by the forum bot and the UI). */
export function describeEspnEvent(ev: EspnMatchEvent): string {
  const min = ev.clock ? ` (${ev.clock})` : "";
  const team = ev.teamName ? ` ${ev.teamName}` : "";
  const who = ev.players.join(", ");
  switch (ev.kind) {
    case "goal":
      return `GOAL for${team}${who ? ` — ${ev.players[0]}` : ""}${ev.assist ? ` (assist ${ev.assist})` : ""}${min}`;
    case "penalty":
      return `PENALTY SCORED for${team}${ev.players[0] ? ` — ${ev.players[0]}` : ""}${min}`;
    case "penalty-missed":
      return `Penalty missed${team ? ` by${team}` : ""}${ev.players[0] ? ` — ${ev.players[0]}` : ""}${min}`;
    case "own-goal":
      return `Own goal${ev.players[0] ? ` — ${ev.players[0]}` : ""}${team ? ` (${ev.teamName})` : ""}${min}`;
    case "red":
      return `RED CARD${ev.players[0] ? ` — ${ev.players[0]}` : ""}${team ? ` (${ev.teamName})` : ""}${min}`;
    case "yellow":
      return `Yellow card${ev.players[0] ? ` — ${ev.players[0]}` : ""}${team ? ` (${ev.teamName})` : ""}${min}`;
    case "sub":
      return `Substitution${team ? ` —${team}` : ""}${ev.playerIn ? `: ${ev.playerIn} on` : ""}${ev.playerOut ? `, ${ev.playerOut} off` : ""}${min}`;
    case "shootout-scored":
      return `Shootout: ${ev.players[0] ?? "Penalty"} scores${team ? ` for${team}` : ""}`;
    case "shootout-missed":
      return `Shootout: ${ev.players[0] ?? "Penalty"} misses${team ? ` for${team}` : ""}`;
    case "var":
      return `VAR${team ? ` —${team}` : ""}${min}`;
    default:
      return `${ev.shortText || ev.text}${min}`;
  }
}

/** Curated, ordered team stat keys for the "Game stats" tab. */
export const PRIMARY_TEAM_STATS: Array<{ name: string; label: string }> = [
  { name: "possessionPct", label: "Possession %" },
  { name: "totalShots", label: "Shots" },
  { name: "shotsOnTarget", label: "Shots on target" },
  { name: "blockedShots", label: "Blocked shots" },
  { name: "wonCorners", label: "Corners" },
  { name: "offsides", label: "Offsides" },
  { name: "foulsCommitted", label: "Fouls" },
  { name: "yellowCards", label: "Yellow cards" },
  { name: "redCards", label: "Red cards" },
  { name: "saves", label: "Saves" },
  { name: "accuratePasses", label: "Accurate passes" },
  { name: "totalPasses", label: "Passes" },
];

/** Per-player stat keys ESPN actually returns in soccer rosters. */
export const PLAYER_STAT_COLUMNS: Array<{ key: string; label: string; title: string }> = [
  { key: "totalGoals", label: "G", title: "Goals" },
  { key: "goalAssists", label: "A", title: "Assists" },
  { key: "totalShots", label: "SH", title: "Shots" },
  { key: "shotsOnTarget", label: "SOT", title: "Shots on target" },
  { key: "foulsCommitted", label: "FC", title: "Fouls committed" },
  { key: "foulsSuffered", label: "FS", title: "Fouls suffered" },
  { key: "yellowCards", label: "YC", title: "Yellow cards" },
  { key: "redCards", label: "RC", title: "Red cards" },
  { key: "ownGoals", label: "OG", title: "Own goals" },
  { key: "saves", label: "SV", title: "Saves" },
  { key: "shotsFaced", label: "SF", title: "Shots faced" },
  { key: "goalsConceded", label: "GC", title: "Goals conceded" },
];

/** Shared, client-safe rules for the MFC Fantasy Manager. */

export const FANTASY_BUDGET_M = 80;

/**
 * The fantasy game is league-only: cup ties, play-offs, friendlies and
 * anything else never becomes a gameweek.
 */
export const FANTASY_LEAGUE_COMPETITIONS = [
  "Championship",
  "EFL Championship",
  "Sky Bet Championship",
  "Premier League",
  "League One",
  "League Two",
] as const;

export function isFantasyLeagueCompetition(competition: string | null | undefined): boolean {
  const c = (competition ?? "").toLowerCase().trim();
  if (!c) return false;
  if (/(cup|trophy|friendl|play[- ]?off|shield|europa|champions league|conference league|papa|checkatrade)/.test(c)) return false;
  return /championship|premier league|league one|league two|efl league/.test(c);
}
export const FANTASY_SQUAD_SIZE = 15;
export const FANTASY_BENCH_SIZE = 4;
export const FANTASY_TRANSFER_HIT = 4;
export const FANTASY_MAX_BANKED_TRANSFERS = 2;
/** Squad locks this many minutes before kick-off. */
export const FANTASY_LOCK_MINUTES = 30;

export type FantasyPosition = "gk" | "def" | "mid" | "fwd";

export const POSITION_LABEL: Record<FantasyPosition, string> = {
  gk: "Goalkeeper",
  def: "Defender",
  mid: "Midfielder",
  fwd: "Forward",
};
export const POSITION_SHORT: Record<FantasyPosition, string> = {
  gk: "GK",
  def: "DEF",
  mid: "MID",
  fwd: "FWD",
};
export const POSITION_ORDER: FantasyPosition[] = ["gk", "def", "mid", "fwd"];

/** Full 15-man squad quotas. */
export const SQUAD_QUOTA: Record<FantasyPosition, number> = { gk: 2, def: 5, mid: 5, fwd: 3 };

export type FormationKey =
  | "4-4-2" | "4-3-3" | "4-2-3-1" | "4-1-4-1" | "4-4-1-1"
  | "3-5-2" | "3-4-3"
  | "5-3-2" | "5-4-1" | "4-5-1";

/** A pitch row: how many of a position sit on that line (goalkeeper first). */
export type FormationRow = { pos: FantasyPosition; count: number };

/**
 * Outfield shape of the starting XI (always 1 GK).
 * `rows` describes how the XI is drawn on the pitch, back to front.
 */
export const FORMATIONS: Record<
  FormationKey,
  { def: number; mid: number; fwd: number; label: string; rows: FormationRow[] }
> = {
  "4-4-2": { def: 4, mid: 4, fwd: 2, label: "Classic flat back four", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 2 }] },
  "4-3-3": { def: 4, mid: 3, fwd: 3, label: "Front-three press", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 3 }, { pos: "fwd", count: 3 }] },
  "4-2-3-1": { def: 4, mid: 5, fwd: 1, label: "Double pivot, No.10", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 2 }, { pos: "mid", count: 3 }, { pos: "fwd", count: 1 }] },
  "4-1-4-1": { def: 4, mid: 5, fwd: 1, label: "Holding midfielder", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 1 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 1 }] },
  "4-4-1-1": { def: 4, mid: 5, fwd: 1, label: "Second striker in the hole", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 4 }, { pos: "mid", count: 1 }, { pos: "fwd", count: 1 }] },
  "3-5-2": { def: 3, mid: 5, fwd: 2, label: "Wing-backs, two up top", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 3 }, { pos: "mid", count: 5 }, { pos: "fwd", count: 2 }] },
  "3-4-3": { def: 3, mid: 4, fwd: 3, label: "Attacking back three", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 3 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 3 }] },
  "5-3-2": { def: 5, mid: 3, fwd: 2, label: "Solid five at the back", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 5 }, { pos: "mid", count: 3 }, { pos: "fwd", count: 2 }] },
  "5-4-1": { def: 5, mid: 4, fwd: 1, label: "Low block, lone striker", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 5 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 1 }] },
  "4-5-1": { def: 4, mid: 5, fwd: 1, label: "Packed midfield", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 5 }, { pos: "fwd", count: 1 }] },
};
export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

export function formationRows(formation: string): FormationRow[] {
  return (FORMATIONS[formation as FormationKey] ?? FORMATIONS["4-4-2"]).rows;
}

export function formationCounts(formation: string) {
  const f = FORMATIONS[formation as FormationKey] ?? FORMATIONS["4-4-2"];
  return { gk: 1, def: f.def, mid: f.mid, fwd: f.fwd };
}

/** Plain-English squad rules, rendered on the Squad rules tab. */
export const SQUAD_RULES: { title: string; body: string }[] = [
  { title: "Budget", body: `You have £${FANTASY_BUDGET_M.toFixed(1)}m to spend on your whole squad. Player values reflect current form and importance to Middlesbrough.` },
  { title: "Squad size", body: `${FANTASY_SQUAD_SIZE} players: ${SQUAD_QUOTA.gk} goalkeepers, ${SQUAD_QUOTA.def} defenders, ${SQUAD_QUOTA.mid} midfielders and ${SQUAD_QUOTA.fwd} forwards.` },
  { title: "Starting XI & bench", body: `Name 11 starters in a legal formation, plus ${FANTASY_BENCH_SIZE} on the bench. Bench players are subbed in automatically (in bench order) if a starter plays no minutes.` },
  { title: "Captain & vice", body: "Your captain scores double. If the captain doesn't play a minute, the vice-captain doubles instead. Both must start." },
  { title: "Transfers", body: `1 free transfer per gameweek, bankable up to ${FANTASY_MAX_BANKED_TRANSFERS}. Extra transfers cost ${FANTASY_TRANSFER_HIT} points each. Replacing a player who has left the club is always free.` },
  { title: "Deadline", body: `Squads lock ${FANTASY_LOCK_MINUTES} minutes before kick-off. After that your team is fixed for that gameweek.` },
  { title: "League games only", body: "Gameweeks are Middlesbrough league fixtures only — cup ties, play-offs and friendlies are never part of the game." },
  { title: "Scoring & prizes", body: "Only Middlesbrough players score. Points are added automatically once each match finishes — see the Scoring tab for the full breakdown." },
];

export const SCORING_RULES: { label: string; points: string }[] = [
  { label: "Played up to 60 minutes", points: "1" },
  { label: "Played 60+ minutes", points: "2" },
  { label: "Goal — goalkeeper or defender", points: "6" },
  { label: "Goal — midfielder", points: "5" },
  { label: "Goal — forward", points: "4" },
  { label: "Assist", points: "3" },
  { label: "Clean sheet — goalkeeper or defender (60+ mins)", points: "4" },
  { label: "Clean sheet — midfielder (60+ mins)", points: "1" },
  { label: "Every 3 saves — goalkeeper", points: "1" },
  { label: "Penalty save", points: "5" },
  { label: "Penalty miss", points: "-2" },
  { label: "Every 2 goals conceded — goalkeeper or defender", points: "-1" },
  { label: "Yellow card", points: "-1" },
  { label: "Red card", points: "-3" },
  { label: "Own goal", points: "-2" },
  { label: "Man of the match bonus (awarded by admin)", points: "3" },
  { label: "Captain", points: "double points" },
  { label: "Extra transfer (beyond your free one)", points: "-4" },
];

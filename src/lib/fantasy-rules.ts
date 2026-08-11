/** Shared, client-safe rules for the MFC Fantasy Manager. */

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
  // Friendlies and non-first-team games are never gameweeks.
  if (/friendl|testimonial|trophy tour|u2\d|under[- ]?2\d|academy|youth|reserves|women/.test(c)) return false;
  // League games, cup ties and play-offs all count.
  return /championship|premier league|league one|league two|efl league|sky bet|carabao|league cup|fa cup|efl trophy|papa|vertu|bristol street|checkatrade|play[- ]?off/.test(
    c,
  );
}

export type FantasyCompetitionGroup = "league" | "cup" | "playoff";

/** Which gameweek section a fixture belongs in on the Gameweeks tab. */
export function fantasyCompetitionGroup(
  competition: string | null | undefined,
): FantasyCompetitionGroup {
  const c = (competition ?? "").toLowerCase().trim();
  if (/play[- ]?off/.test(c)) return "playoff";
  if (/cup|trophy|papa|vertu|bristol street|checkatrade|shield/.test(c)) return "cup";
  return "league";
}

export const FANTASY_GROUP_LABEL: Record<FantasyCompetitionGroup, string> = {
  league: "League games",
  cup: "Cup games",
  playoff: "Play-off games",
};
/** Default bench size (EFL competitions name 7 subs). */
export const FANTASY_BENCH_SIZE = 7;
export const FANTASY_SQUAD_SIZE = 11 + FANTASY_BENCH_SIZE;
/** Squad locks this many minutes before kick-off. */
export const FANTASY_LOCK_MINUTES = 120;
/** The bench must always include at least this many goalkeepers. */
export const FANTASY_BENCH_MIN_GK = 1;

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

/**
 * Bench cover applies to Championship and cup games only. The manager picks
 * their own 11 and subs, with the single requirement of a back-up goalkeeper.
 */
export type BenchRules = {
  /** Exact number of subs a manager names. */
  size: number;
  /** Competition label these rules came from. */
  competition: string;
  /** Minimum goalkeepers required on the bench. */
  minGk: number;
};

export function benchRulesFor(competition: string | null | undefined): BenchRules {
  return { size: FANTASY_BENCH_SIZE, competition: competition?.trim() || "Championship", minGk: FANTASY_BENCH_MIN_GK };
}

/** Total squad size (XI + bench) for a competition. */
export function squadSizeFor(competition: string | null | undefined): number {
  return 11 + benchRulesFor(competition).size;
}

/** Named substitutes allowed per competition, for the rules tab. */
export const COMPETITION_BENCH_RULES: { competition: string; subs: number }[] = [
  { competition: "Sky Bet Championship", subs: FANTASY_BENCH_SIZE },
  { competition: "Cup games", subs: FANTASY_BENCH_SIZE },
];

export type FormationKey =
  | "4-4-2" | "4-3-3" | "4-2-3-1" | "4-1-4-1" | "4-4-1-1"
  | "5-3-2" | "5-4-1";


/**
 * A pitch row: how many of a position sit on that line (goalkeeper first).
 * `alt` marks a flexible line — either position can fill those slots
 * (e.g. the three behind the striker in 4-2-3-1 can be midfielders or forwards).
 */
export type FormationRow = { pos: FantasyPosition; count: number; alt?: FantasyPosition; startIndex: number };

/** Every position allowed on a given pitch row. */
export function rowPositions(row: FormationRow): FantasyPosition[] {
  return row.alt ? [row.pos, row.alt] : [row.pos];
}

/** Human label for a slot that allows one or two positions. */
export function slotPositionLabel(positions: FantasyPosition[]): string {
  return positions.map((p) => POSITION_SHORT[p]).join(" / ");
}

/**
 * Outfield shape of the starting XI (always 1 GK).
 * `rows` describes how the XI is drawn on the pitch, back to front.
 */
export const FORMATIONS: Record<
  FormationKey,
  { def: number; mid: number; fwd: number; label: string; rows: Omit<FormationRow, "startIndex">[] }
> = {
  "4-4-2": { def: 4, mid: 4, fwd: 2, label: "Classic flat back four", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 2 }] },
  "4-3-3": { def: 4, mid: 3, fwd: 3, label: "Front-three press", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 3 }, { pos: "fwd", count: 3 }] },
  "4-2-3-1": { def: 4, mid: 5, fwd: 1, label: "Double pivot, No.10", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 2 }, { pos: "mid", count: 3, alt: "fwd" }, { pos: "fwd", count: 1 }] },
  "4-1-4-1": { def: 4, mid: 5, fwd: 1, label: "Holding midfielder", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 1 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 1 }] },
  "4-4-1-1": { def: 4, mid: 4, fwd: 2, label: "Second striker in the hole", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 4 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 1 }, { pos: "fwd", count: 1 }] },
  "5-3-2": { def: 5, mid: 3, fwd: 2, label: "Solid five at the back", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 5 }, { pos: "mid", count: 3 }, { pos: "fwd", count: 2 }] },
  "5-4-1": { def: 5, mid: 4, fwd: 1, label: "Low block, lone striker", rows: [{ pos: "gk", count: 1 }, { pos: "def", count: 5 }, { pos: "mid", count: 4 }, { pos: "fwd", count: 1 }] },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

/** Convert a formation key into pitch rows from back to front, with absolute slot offsets. */
export function formationRows(formation: string): FormationRow[] {
  const rows = (FORMATIONS[formation as FormationKey] ?? FORMATIONS["4-4-2"]).rows;
  let startIndex = 0;
  return rows.map((r) => {
    const row = { ...r, startIndex };
    startIndex += r.count;
    return row;
  });
}

export function formationCounts(formation: string) {
  const f = FORMATIONS[formation as FormationKey] ?? FORMATIONS["4-4-2"];
  return { gk: 1, def: f.def, mid: f.mid, fwd: f.fwd };
}

/**
 * How many of each position a formation allows in the XI. Fixed rows give an
 * exact number; flexible rows widen the range for both of their positions.
 */
export function formationPositionRange(
  formation: string,
): Record<FantasyPosition, { min: number; max: number }> {
  const range = {
    gk: { min: 0, max: 0 },
    def: { min: 0, max: 0 },
    mid: { min: 0, max: 0 },
    fwd: { min: 0, max: 0 },
  } as Record<FantasyPosition, { min: number; max: number }>;
  for (const row of formationRows(formation)) {
    if (row.alt) {
      range[row.pos].max += row.count;
      range[row.alt].max += row.count;
    } else {
      range[row.pos].min += row.count;
      range[row.pos].max += row.count;
    }
  }
  return range;
}

/** Has the first league fixture of the season kicked off? */
export function isFantasySeasonStarted(gameweeks: { kickoffAt: string }[]): boolean {
  if (!gameweeks.length) return false;
  return new Date(gameweeks[0].kickoffAt).getTime() <= Date.now();
}

/** Real-world transfer windows — shown for information on the Transfers tab. */
export const FANTASY_TRANSFER_WINDOWS: { label: string; opensAt: string; closesAt: string }[] = [
  { label: "Summer 2026", opensAt: "2026-06-01T00:00:00Z", closesAt: "2026-09-01T22:00:00Z" },
  { label: "Winter 2027", opensAt: "2027-01-01T00:00:00Z", closesAt: "2027-02-02T23:00:00Z" },
];

export function currentFantasyTransferWindow(now: Date = new Date()) {
  const t = now.getTime();
  return (
    FANTASY_TRANSFER_WINDOWS.find(
      (w) => t >= Date.parse(w.opensAt) && t <= Date.parse(w.closesAt),
    ) ?? null
  );
}

/** True while a real transfer window is open. */
export function isFantasyTransferWindowOpen(now: Date = new Date()): boolean {
  return currentFantasyTransferWindow(now) !== null;
}

export function formatWindowDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Plain-English game rules, rendered on the Game rules tab. */
export const SQUAD_RULES: { title: string; body: string }[] = [
  { title: "Match day 11", body: "Each gameweek you name a match day 11 in a legal formation. Only Middlesbrough players available for that fixture can be picked — departed and loaned-out players can't be selected." },
  { title: "Sub bench", body: `Bench cover applies to Championship and cup games — name ${FANTASY_BENCH_SIZE} subs. Sub 1 must be the replacement goalkeeper, and at least ${FANTASY_BENCH_MIN_GK} goalkeeper must be on the bench. Otherwise you pick your own 11 and outfield subs, with no other position cover.` },
  { title: "Subs score too", body: "Any starter who doesn't play scores 0. A sub who comes on is scored on the sub points system (+1 for coming on, +1 for 30+ minutes, +1 for a goal or assist) on top of their match stats — unless they play most of the game (60+ minutes), when they're scored exactly like a starter with no sub bonuses. Either way the points are added to your gameweek total. Subs who stay on the bench score 0." },
  { title: "Captain & vice", body: "Your captain scores double. If the captain doesn't play a minute, the vice-captain doubles instead. Both must start." },
  { title: "Deadline", body: "Entries lock 2 hours before kick-off. After that your team is fixed for that gameweek." },
  { title: "Competitive games only", body: "Gameweeks cover every competitive Middlesbrough first-team fixture — league games, cup ties and play-offs. Friendlies, testimonials and academy games are never part of the game." },
  { title: "Game time on show", body: "Once a match finishes the pitch view shows how many minutes each of your players actually played, so you can see who started, who came on and who didn't feature." },
  { title: "Scoring & prizes", body: "Only Middlesbrough players score. Points are added automatically once each match finishes — see the Scoring tab for the full breakdown." },
];

/**
 * Scoring split into columns: what the action is, the minimum game time needed
 * for it, then what a match day 11 starter earns and what a sub earns.
 */
export const SCORING_RULES: {
  label: string;
  minTime: string;
  starter: string;
  sub: string;
}[] = [
  { label: "Appearance", minTime: "1+ sec", starter: "1", sub: "1" },
  { label: "Played most of the game", minTime: "60+ mins", starter: "2", sub: "2 (scored as a starter — no sub bonuses)" },
  { label: "Impact sub — time on the pitch", minTime: "30+ mins", starter: "—", sub: "+1" },
  { label: "Impact sub — goal or assist", minTime: "1+ sec", starter: "—", sub: "+1" },
  { label: "Named but doesn't get on", minTime: "0 mins", starter: "0", sub: "0" },
  { label: "Goal — goalkeeper or defender", minTime: "1+ sec", starter: "6", sub: "6" },
  { label: "Goal — midfielder", minTime: "1+ sec", starter: "5", sub: "5" },
  { label: "Goal — forward", minTime: "1+ sec", starter: "4", sub: "4" },
  { label: "Assist", minTime: "1+ sec", starter: "3", sub: "3" },
  { label: "Clean sheet — goalkeeper or defender", minTime: "60+ mins", starter: "4", sub: "4" },
  { label: "Clean sheet — midfielder", minTime: "60+ mins", starter: "1", sub: "1" },
  { label: "Every 3 saves — goalkeeper", minTime: "1+ sec", starter: "1", sub: "1" },
  { label: "Penalty save", minTime: "1+ sec", starter: "5", sub: "5" },
  { label: "Penalty miss", minTime: "1+ sec", starter: "-2", sub: "-2" },
  { label: "Every 2 goals conceded — goalkeeper or defender", minTime: "1+ sec", starter: "-1", sub: "-1" },
  { label: "Yellow card", minTime: "1+ sec", starter: "-1", sub: "-1" },
  { label: "Red card", minTime: "1+ sec", starter: "-3", sub: "-3" },
  { label: "Own goal", minTime: "1+ sec", starter: "-2", sub: "-2" },
  { label: "Man of the match bonus (awarded by admin)", minTime: "1+ sec", starter: "3", sub: "3" },
  { label: "Captain (vice if captain doesn't play)", minTime: "1+ sec", starter: "double points", sub: "—" },
];

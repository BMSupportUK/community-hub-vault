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
 * Which position a player is actually scored in when he fills a given pitch
 * slot: his main listed position when the slot allows it, otherwise his second
 * position. Returns null when he can't play in that slot at all.
 */
export function resolveSlotPosition(
  slot: FantasyPosition[],
  player: { position: FantasyPosition; altPosition?: FantasyPosition | null },
): FantasyPosition | null {
  const allowed = playerPositions(player).filter((p) => slot.includes(p));
  return allowed[0] ?? null;
}

/**
 * Every position a player can be picked in: their listed position plus an
 * optional second position (e.g. a forward who can also play in midfield).
 */
export function playerPositions(p: {
  position: FantasyPosition;
  altPosition?: FantasyPosition | null;
}): FantasyPosition[] {
  return p.altPosition && p.altPosition !== p.position ? [p.position, p.altPosition] : [p.position];
}

/** Short badge label for a player, showing a second position when they have one. */
export function playerPositionLabel(p: {
  position: FantasyPosition;
  altPosition?: FantasyPosition | null;
}): string {
  return playerPositions(p).map((x) => POSITION_SHORT[x]).join("/");
}

/**
 * Can these 11 players be arranged into the formation? Dual-position players
 * can fill either of their lines, so the shape is checked by trying every
 * assignment rather than counting listed positions.
 */
export function xiFitsFormation(formation: string, sets: FantasyPosition[][]): boolean {
  const range = formationPositionRange(formation);
  const order: FantasyPosition[] = ["gk", "def", "mid", "fwd"];
  const counts: Record<FantasyPosition, number> = { gk: 0, def: 0, mid: 0, fwd: 0 };
  const dfs = (i: number): boolean => {
    if (i === sets.length) return order.every((pos) => counts[pos] >= range[pos].min && counts[pos] <= range[pos].max);
    for (const pos of sets[i]) {
      if (counts[pos] >= range[pos].max) continue;
      counts[pos]++;
      if (dfs(i + 1)) return true;
      counts[pos]--;
    }
    return false;
  };
  return dfs(0);
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
  { title: "The game", body: `A Middlesbrough-only fantasy game. There is no budget and no player prices: every available Boro player is free to pick, so it comes down to who you think will perform. Each competitive fixture is a gameweek, and you name a fresh ${FANTASY_SQUAD_SIZE}-man squad for every one of them.` },
  { title: "Match day 11", body: "Each gameweek you name a match day 11 in one of the allowed formations. Only Middlesbrough players available for that fixture can be picked — players who have left the club or gone out on loan can't be selected. Players who join on loan are available and are flagged as loan signings in the player list." },
  { title: "Sub bench", body: `Name ${FANTASY_BENCH_SIZE} subs alongside your 11, for a ${FANTASY_SQUAD_SIZE}-man squad. Sub 1 is reserved for your replacement goalkeeper, so at least ${FANTASY_BENCH_MIN_GK} goalkeeper is always on the bench. The rest of the bench is your call — there is no other position cover to worry about.` },
  { title: "Every gameweek is a fresh pick", body: "Squads don't carry over. Each gameweek starts blank until you pick it, and right up to the deadline you can change your 11, your bench, your formation, your captain and your vice as often as you like — all free, with no transfer limits or point hits. You can build your side using the pitch and bench slots or by dragging players between your bench and your 11." },
  { title: "Subs score half", body: "Where you named the player decides what they earn: anyone in your match day 11 who features earns 2 points for the appearance and the full points for every match stat. A sub who comes off your bench earns 1 point for the appearance and half points for every match stat — the stat points are added up first, then halved and rounded. Starters who don't play and subs who stay on the bench score 0." },
  { title: "Only 5 subs score", body: "Just like the real thing, only five substitutes can score for you. If more than five of your subs feature, the five who played the most minutes earn the points and any other sub is locked at 0 for that gameweek no matter what they do in the match. Subs who never get on also score 0." },
  { title: "Automatic line-up swaps", body: "When Middlesbrough's official starting eleven is announced, any sub on your bench who is starting is swapped automatically into your eleven in place of a player you picked who isn't starting. Swaps are like for like: the sub must be able to play that slot's position — his listed position or, for dual-position players, his second position — otherwise your original pick stays put. A swapped player scores in the slot he moved into, and a note of every swap is shown on your squad." },
  { title: "Captain & vice", body: "Your captain scores double. If the captain doesn't play a minute, the vice-captain doubles instead. Both must start." },
  { title: "Two-position players", body: "Some players can play in two positions (for example a forward who can also play in midfield). For those players you must choose the position they score in — nothing is picked for you. A midfield choice pays midfielder points (5 a goal, plus the midfielder clean-sheet points), a forward choice pays forward points. This applies to bench players as well as starters, and your squad can't be saved until every dual-position player has a scoring position selected." },
  { title: "Injuries & availability", body: "Injured, doubtful and suspended players stay pickable but are flagged with a warning — pick them at your own risk, because a player who doesn't feature scores 0. For league games, players outside the club's registered 25-man squad are also flagged." },
  { title: "One deadline", body: `There is a single deadline: entries lock ${FANTASY_LOCK_MINUTES / 60} hours before kick-off and that is it. Once the countdown reads locked nothing can change — no new players in or out, no formation changes, no sub swaps and no captain or vice changes. Get your side in before the clock runs out.` },
  { title: "What scores points", body: "Points come from goals (6 for a keeper or defender, 5 for a midfielder, 4 for a forward), assists (3), every shot (1 each), every shot on goal that wasn't a goal (2 each, scored on its own line on top of the shot point), saves (1 each), shots on goal faced by your keeper (1 each), goals conceded by your keeper (−1 each), clean sheets, penalties saved and missed, yellow and red cards, own goals and a man-of-the-match bonus. The full table, including the halved sub values, is on the Scoring tab." },
  { title: "Competitive games only", body: "Gameweeks cover every competitive Middlesbrough first-team fixture — league games, cup ties and play-offs — in date order, with cup ties slotted into the gameweek their date falls in. Friendlies, testimonials and academy games are never part of the game." },
  { title: "Game time on show", body: "Once a match finishes the pitch view shows how many minutes each of your players actually played, so you can see who started, who came on and who didn't feature." },
  { title: "Leaderboard", body: "Points are added automatically once each match finishes and totals run all season on the Leaderboard tab. Once a gameweek is locked you can open any rival's squad for that gameweek from the leaderboard." },
  { title: "Scoring & prizes", body: "Only Middlesbrough players score. FotMob supplies the available player match stats, while the game applies its own appearance, substitute, captain, clean-sheet, penalty, card, own-goal and bonus rules. Points are updated once the match finishes and all stats and bonuses have been confirmed. Starters score the full amount and subs score half. Winners are announced on the Winners tab at the end of the season — see the Scoring tab for the full points breakdown." },
];

/**
 * Scoring split into columns: what the action is, the minimum game time needed
 * for it, then what a match day 11 starter earns and what a sub earns.
 */
export const SCORING_RULES: {
  /** Short FotMob-style code shown next to the points. */
  abbr: string;
  label: string;
  minTime: string;
  starter: string;
  sub: string;
}[] = [
  { abbr: "APP", label: "Appearance — named in your match day 11", minTime: "1+ sec", starter: "2", sub: "—" },
  { abbr: "SUB", label: "Appearance — comes on from your bench", minTime: "1+ sec", starter: "—", sub: "1" },
  { abbr: "DNP", label: "Named but doesn't get on", minTime: "0 mins", starter: "0", sub: "0" },
  { abbr: "C", label: "Captain (vice if captain doesn't play)", minTime: "1+ sec", starter: "double points", sub: "double points" },
  { abbr: "G", label: "Goal scored — goalkeeper or defender", minTime: "1+ sec", starter: "6 pts", sub: "3 pts" },
  { abbr: "G", label: "Goal scored — midfielder", minTime: "1+ sec", starter: "5 pts", sub: "2.5 pts" },
  { abbr: "G", label: "Goal scored — forward", minTime: "1+ sec", starter: "4 pts", sub: "2 pts" },
  { abbr: "A", label: "Assists", minTime: "1+ sec", starter: "3 pts", sub: "1.5 pts" },
  { abbr: "SHOT", label: "Shots (any attempt at goal, on or off target)", minTime: "1+ sec", starter: "1 pt", sub: "0.5 pt" },
  { abbr: "SOG", label: "Shots on goal that weren't goals (scored separately, on top of the shot point)", minTime: "1+ sec", starter: "2 pts", sub: "1 pt" },
  { abbr: "SV", label: "Saves — goalkeeper", minTime: "1+ sec", starter: "1 pt", sub: "0.5 pt" },
  { abbr: "SOGA", label: "Shots on goal faced — goalkeeper", minTime: "1+ sec", starter: "1 pt", sub: "0.5 pt" },
  { abbr: "GA", label: "Goal conceded — goalkeeper", minTime: "1+ sec", starter: "−1 pt", sub: "−0.5 pt" },
  { abbr: "CS", label: "Clean sheet (60+ mins) — goalkeeper or defender", minTime: "60+ mins", starter: "4 pts", sub: "2 pts" },
  { abbr: "CS", label: "Clean sheet (60+ mins) — midfielder", minTime: "60+ mins", starter: "1 pt", sub: "0.5 pt" },
  { abbr: "CS-", label: "Clean sheet (under 60 mins) — goalkeeper or defender", minTime: "60- mins", starter: "2 pts", sub: "1 pt" },
  { abbr: "CS-", label: "Clean sheet (under 60 mins) — midfielder", minTime: "60- mins", starter: "0.5 pt", sub: "0.25 pt" },
  { abbr: "PS", label: "Penalty saved — goalkeeper", minTime: "1+ sec", starter: "+5 pts", sub: "+2.5 pts" },
  { abbr: "PM", label: "Penalty missed", minTime: "1+ sec", starter: "−2 pts", sub: "−1 pt" },
  { abbr: "YC", label: "Yellow card", minTime: "1+ sec", starter: "−1 pt", sub: "−0.5 pt" },
  { abbr: "RC", label: "Red card", minTime: "1+ sec", starter: "−3 pts", sub: "−1.5 pts" },
  { abbr: "OG", label: "Own goals", minTime: "1+ sec", starter: "−2 pts", sub: "−1 pt" },
  { abbr: "★★★", label: "Star man of the gameweek (best 0-10 match rating from the official stats, any competition)", minTime: "1+ sec", starter: "3 pts", sub: "1.5 pts" },
  { abbr: "★★", label: "Second star player of the gameweek", minTime: "1+ sec", starter: "2 pts", sub: "1 pt" },
  { abbr: "★", label: "Third star player of the gameweek", minTime: "1+ sec", starter: "1 pt", sub: "0.5 pt" },
];

/**
 * Every stat column we read from the FotMob match report, with its FotMob-style
 * abbreviation, what it means and what a match day 11 starter earns for each
 * one (subs earn half). Stats with no point value are shown for information
 * only, exactly as FotMob lists them.
 */
export const PLAYER_STAT_META: Record<
  string,
  { abbr: string; means: string; points?: Partial<Record<FantasyPosition, number>> | number }
> = {
  minutes: { abbr: "MIN", means: "Minutes played" },
  goals: { abbr: "G", means: "Goals scored", points: { gk: 6, def: 6, mid: 5, fwd: 4 } },
  assists: { abbr: "A", means: "Assists", points: 3 },
  shots: { abbr: "SHOT", means: "Shots — any attempt at goal", points: { def: 1, mid: 1, fwd: 1 } },
  shots_on_target: {
    abbr: "SOG",
    means: "Shots on goal (goals excluded when scoring)",
    points: { def: 2, mid: 2, fwd: 2 },
  },
  shots_faced: { abbr: "SF", means: "Shots faced" },
  shots_on_goal_against: { abbr: "SOGA", means: "Shots on goal against", points: { gk: 1 } },
  saves: { abbr: "SV", means: "Saves", points: { gk: 1 } },
  pens_saved: { abbr: "PS", means: "Penalties saved", points: { gk: 5 } },
  pens_missed: { abbr: "PM", means: "Penalties missed", points: { gk: -2, def: -2, mid: -2, fwd: -2 } },
  goals_conceded: { abbr: "GA", means: "Goals conceded", points: { gk: -1 } },
  passes: { abbr: "PASS", means: "Passes attempted" },
  accurate_passes: { abbr: "AC.PASS", means: "Accurate passes" },
  accurate_long_balls: { abbr: "AC.LONG", means: "Accurate long balls" },
  big_chances_created: { abbr: "BCC", means: "Big chances created" },
  big_chances_missed: { abbr: "BCM", means: "Big chances missed" },
  touches: { abbr: "TCH", means: "Touches" },
  duels_won: { abbr: "DUELW", means: "Duels won" },
  defensive_interventions: { abbr: "DINT", means: "Defensive interventions" },
  crosses_claimed: { abbr: "CC", means: "Crosses claimed" },
  unclaimed_crosses: { abbr: "UC", means: "Unclaimed crosses" },
  keeper_sweepers: { abbr: "KS", means: "Keeper sweepers" },
  fouls_committed: { abbr: "FC", means: "Fouls committed" },
  fouls_suffered: { abbr: "FA", means: "Fouls suffered" },
  offsides: { abbr: "OFF", means: "Offsides" },
  yellows: { abbr: "YC", means: "Yellow cards", points: -1 },
  reds: { abbr: "RC", means: "Red cards", points: -3 },
  own_goals: { abbr: "OG", means: "Own goals", points: -2 },
  bonus: { abbr: "STAR", means: "Star player bonus (3 / 2 / 1 pts for the top three ratings)", points: 1 },
};

/** Points a starter earns per unit of a stat, for the player profile table. */
/**
 * Our own scoring lines — the things the fantasy game itself awards
 * (appearance, goals, assists, cards, own goals, missed pens). Clean sheets
 * are derived separately. Everything else that scores comes off the FotMob
 * match centre.
 */
export const OUR_SCORING_STAT_KEYS = [
  "minutes",
  "goals",
  "assists",
  "pens_saved",
  "pens_missed",
  "yellows",
  "reds",
  "own_goals",
] as const;

export function isOurScoringStat(key: string): boolean {
  return (OUR_SCORING_STAT_KEYS as readonly string[]).includes(key);
}

export function statPointsPer(key: string, position: FantasyPosition): number | null {
  const meta = PLAYER_STAT_META[key];
  if (!meta?.points) return null;
  if (typeof meta.points === "number") return meta.points;
  return meta.points[position] ?? null;
}

// The live stat legend is built from PLAYER_STAT_META, which mirrors the
// scoring rules table, so there is no separate hand-written stat key here.

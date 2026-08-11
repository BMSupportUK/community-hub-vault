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
/**
 * After the lock, managers may still swap subs into the XI (no new players in
 * or out) until this many minutes before kick-off.
 */
export const FANTASY_FINAL_SWAP_MINUTES = 10;
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
  { title: "Every gameweek is a fresh pick", body: "Squads don't carry over. Each gameweek starts blank until you pick it, and until the deadline you can change your 11, your bench, your formation, your captain and your vice as often as you like — all free, with no transfer limits or point hits." },
  { title: "Subs score half", body: "Where you named the player decides what they earn: anyone in your match day 11 who features earns 2 points for the appearance and the full points for every match stat. A sub who comes off your bench earns 1 point for the appearance and half points for every match stat — the stat points are added up first, then halved and rounded. Starters who don't play and subs who stay on the bench score 0." },
  { title: "Captain & vice", body: "Your captain scores double. If the captain doesn't play a minute, the vice-captain doubles instead. Both must start." },
  { title: "Two-position players", body: "Some players can play in two positions (for example a forward who can also play in midfield). For those players you must choose the position they score in — nothing is picked for you. A midfield choice pays midfielder points (5 a goal, plus the midfielder clean-sheet point), a forward choice pays forward points. This applies to bench players as well as starters, and your squad can't be saved until every dual-position player has a scoring position selected." },
  { title: "Injuries & availability", body: "Injured, doubtful and suspended players stay pickable but are flagged with a warning — pick them at your own risk, because a player who doesn't feature scores 0. For league games, players outside the club's registered 25-man squad are also flagged." },
  { title: "Deadline", body: `Entries lock ${FANTASY_LOCK_MINUTES / 60} hours before kick-off. At that point the ${FANTASY_SQUAD_SIZE} players you have named and your formation are fixed — no new players in or out, and no formation changes.` },
  { title: "Late sub swaps", body: `Once the gameweek locks you can still swap your named subs with your match day 11 — and change your captain and vice — right up until ${FANTASY_FINAL_SWAP_MINUTES} minutes before kick-off. Drag and drop is only enabled in this window, and only for moving players between your bench and your 11: before the deadline you build your squad using the pitch and bench slots. Nothing else can change in that window: your ${FANTASY_SQUAD_SIZE} named players and your formation are both fixed at the original lock. At ${FANTASY_FINAL_SWAP_MINUTES} minutes before kick-off your team is final and the countdown reads locked.` },
  { title: "Competitive games only", body: "Gameweeks cover every competitive Middlesbrough first-team fixture — league games, cup ties and play-offs — in date order, with cup ties slotted into the gameweek their date falls in. Friendlies, testimonials and academy games are never part of the game." },
  { title: "Game time on show", body: "Once a match finishes the pitch view shows how many minutes each of your players actually played, so you can see who started, who came on and who didn't feature." },
  { title: "Leaderboard", body: "Points are added automatically once each match finishes and totals run all season on the Leaderboard tab. Once a gameweek is locked you can open any rival's squad for that gameweek from the leaderboard." },
  { title: "Scoring & prizes", body: "Only Middlesbrough players score. Every point is built from the stats in the official ESPN match report player stats table — goals, assists, shots, shots on goal, passes, accurate long balls, big chances created and missed, touches, duels won, defensive interventions, saves, shots on goal against, crosses claimed and unclaimed, keeper sweepers, goals conceded, fouls, cards and own goals — so points are worked out automatically and can be checked against the match report. Starters score the full amount and subs score half. Winners are announced on the Winners tab at the end of the season — see the Scoring tab for the full points breakdown and a key to every stat." },
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
  { label: "Appearance — named in your match day 11", minTime: "1+ sec", starter: "2", sub: "—" },
  { label: "Appearance — comes on from your bench", minTime: "1+ sec", starter: "—", sub: "1" },
  { label: "Named but doesn't get on", minTime: "0 mins", starter: "0", sub: "0" },
  { label: "Captain (vice if captain doesn't play)", minTime: "1+ sec", starter: "double points", sub: "double points" },
];

/**
 * Key to the match stats the points are built from. Only stats that actually
 * earn points are listed. These match the columns in the official ESPN match
 * report "player stats" table, so anyone can check a player's points against
 * the match report.
 */
export const STAT_KEY: {
  stat: string;
  means: string;
  positions: FantasyPosition[];
  byPosition?: Partial<Record<FantasyPosition, string>>;
}[] = [
  {
    stat: "G — Goals",
    means: "Goals scored: 6 pts for a keeper or defender, 5 for a midfielder, 4 for a forward.",
    positions: ["gk", "def", "mid", "fwd"],
    byPosition: { gk: "6 pts", def: "6 pts", mid: "5 pts", fwd: "4 pts" },
  },
  {
    stat: "A — Assists",
    means: "All positions: passes or touches that directly set up a team-mate's goal. 3 pts.",
    positions: ["gk", "def", "mid", "fwd"],
  },
  {
    stat: "Clean sheet",
    means: "No goals conceded while on the pitch for 60 minutes or more. Keepers and defenders earn 4 pts, midfielders earn 1 pt.",
    positions: ["gk", "def", "mid"],
    byPosition: { gk: "4 pts", def: "4 pts", mid: "1 pt" },
  },
  { stat: "Cards", means: "Yellow card -1 pt, red card -3 pts.", positions: ["gk", "def", "mid", "fwd"] },
  { stat: "Penalties", means: "Penalty saved by a keeper +5 pts, penalty missed -2 pts.", positions: ["gk", "def", "mid", "fwd"] },
  { stat: "OG — Own goals", means: "Goals put into your own net: -2 pts each.", positions: ["gk", "def", "mid", "fwd"] },
  { stat: "MOTM bonus", means: "Bonus points added for standout / man-of-the-match performances.", positions: ["gk", "def", "mid", "fwd"] },
  { stat: "SHOT — Shots", means: "Outfield players: every attempt at goal, on or off target. 1 pt per shot.", positions: ["def", "mid", "fwd"] },
  { stat: "SOG — Shots on Goal", means: "Outfield players: attempts on target — saved, blocked on the line or scored. 1 pt each.", positions: ["def", "mid", "fwd"] },
  { stat: "BCC — Big Chances Created", means: "Outfield players: passes that handed a team-mate a clear scoring chance. 3 pts each.", positions: ["def", "mid", "fwd"] },
  { stat: "BCM — Big Chances Missed", means: "Outfield players: clear scoring chances the player failed to convert. -2 pts each.", positions: ["def", "mid", "fwd"] },
  { stat: "DUELW — Duels Won", means: "Outfield players: ground and aerial contests the player came out on top of. 1 pt per duel won.", positions: ["def", "mid", "fwd"] },
  { stat: "DINT — Defensive Interventions", means: "Outfield players: tackles, interceptions, blocks and clearances combined. 1 pt per intervention.", positions: ["def", "mid", "fwd"] },
  { stat: "SOGA — Shots on Goal Against", means: "Goalkeepers only: attempts on target the keeper had to deal with. 1 pt per shot faced.", positions: ["gk"] },
  { stat: "SV — Saves", means: "Goalkeepers only: shots on target kept out. 1 pt per save.", positions: ["gk"] },
  { stat: "GA — Goals Conceded", means: "Goalkeepers only: goals Middlesbrough conceded while the keeper was on the pitch. -1 pt per goal conceded.", positions: ["gk"] },
  { stat: "CC — Crosses Claimed", means: "Goalkeepers only: crosses into the box the keeper gathered cleanly. 1 pt each.", positions: ["gk"] },
  { stat: "UC — Unclaimed Crosses", means: "Goalkeepers only: crosses the keeper went for but failed to gather. -1 pt each.", positions: ["gk"] },
  { stat: "KS — Keeper Sweepers", means: "Goalkeepers only: times the keeper came out of the area to clear the danger. 1 pt each.", positions: ["gk"] },
  { stat: "PASS — Passes", means: "Goalkeepers only: total passes attempted by the keeper. 1 pt per pass.", positions: ["gk"] },
  { stat: "AC.LONG — Accurate Long Balls", means: "Goalkeepers only: long passes (over roughly 30 yards) that found a team-mate. 1 pt per accurate long ball.", positions: ["gk"] },
  { stat: "AC.PASS — Accurate Passes", means: "All positions: passes that found a team-mate. 1 pt per accurate pass.", positions: ["gk", "def", "mid", "fwd"] },
];

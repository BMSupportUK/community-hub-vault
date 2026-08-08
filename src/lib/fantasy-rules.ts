/** Shared, client-safe rules for the MFC Fantasy Manager. */

export const FANTASY_BUDGET_M = 30;
export const FANTASY_SQUAD_SIZE = 15;
export const FANTASY_BENCH_SIZE = 4;
export const FANTASY_TRANSFER_HIT = 4;
export const FANTASY_MAX_BANKED_TRANSFERS = 2;
/** Squad locks this many minutes before kick-off. */
export const FANTASY_LOCK_MINUTES = 60;

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

export type FormationKey = "4-4-2" | "4-3-3" | "3-5-2" | "5-3-2" | "4-5-1" | "3-4-3";

/** Outfield shape of the starting XI (always 1 GK). */
export const FORMATIONS: Record<FormationKey, { def: number; mid: number; fwd: number }> = {
  "4-4-2": { def: 4, mid: 4, fwd: 2 },
  "4-3-3": { def: 4, mid: 3, fwd: 3 },
  "3-5-2": { def: 3, mid: 5, fwd: 2 },
  "5-3-2": { def: 5, mid: 3, fwd: 2 },
  "4-5-1": { def: 4, mid: 5, fwd: 1 },
  "3-4-3": { def: 3, mid: 4, fwd: 3 },
};
export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

export function formationCounts(formation: string) {
  const f = FORMATIONS[formation as FormationKey] ?? FORMATIONS["4-4-2"];
  return { gk: 1, ...f };
}

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

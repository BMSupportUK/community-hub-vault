import { Coffee, UtensilsCrossed, Car } from "lucide-react";

export type BreakKind = "break" | "lunch" | "travel";

/** Allowed duration per break kind, in seconds. */
export const BREAK_LIMITS: Record<BreakKind, number> = {
  break: 15 * 60,
  lunch: 30 * 60,
  travel: 60 * 60,
};

export function breakLabel(kind: BreakKind): string {
  if (kind === "travel") return "Travelling home";
  if (kind === "lunch") return "Lunch break";
  return "Break";
}

export function breakIcon(kind: BreakKind) {
  if (kind === "travel") return Car;
  if (kind === "lunch") return UtensilsCrossed;
  return Coffee;
}

/** How many times each break kind may be taken per shift. */
export const BREAK_ALLOWANCE: Record<"break" | "lunch", number> = {
  break: 2,
  lunch: 1,
};

/** Breaks of this kind still available on the current shift. */
export function breaksLeft(kind: "break" | "lunch", kindsUsed: readonly string[]): number {
  const used = kindsUsed.filter((k) => k === kind).length;
  return Math.max(0, BREAK_ALLOWANCE[kind] - used);
}

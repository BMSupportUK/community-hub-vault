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

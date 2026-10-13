import { Coffee, UtensilsCrossed } from "lucide-react";

export type BreakKind = "break" | "lunch";

/** Allowed duration per break kind, in seconds. `travel` is kept only so
 *  historical travelling-home rows still calculate — no new ones are created. */
export const BREAK_LIMITS: Record<BreakKind, number> & { travel: number } = {
  break: 15 * 60,
  lunch: 30 * 60,
  travel: 60 * 60,
};

export function breakLabel(kind: BreakKind): string {
  if (kind === "lunch") return "Main break";
  return "Break";
}

export function breakIcon(kind: BreakKind) {
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
  const used = kindsUsed.filter((k) => k === kind || k.startsWith(`${kind}@`)).length;
  return Math.max(0, BREAK_ALLOWANCE[kind] - used);
}

/** Minutes since midnight in UK office time for an ISO timestamp. */
export function ukMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/**
 * Live countdown for an active break: `mm:ss` of allowance still to run, or the
 * amount over once it has passed. `over` picks the warning/danger colouring.
 */
export function breakCountdown(kind: BreakKind, startedAt: string, nowMs: number) {
  const usedSec = (nowMs - new Date(startedAt).getTime()) / 1000;
  const remainingSec = BREAK_LIMITS[kind] - usedSec;
  const over = remainingSec < 0;
  const abs = Math.floor(Math.abs(remainingSec));
  const mm = Math.floor(abs / 60).toString().padStart(2, "0");
  const ss = (abs % 60).toString().padStart(2, "0");
  return { remainingSec, over, label: over ? `+${mm}:${ss}` : `${mm}:${ss}` };
}

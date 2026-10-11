import { normalizeEarlyFinishReason } from "@/lib/shift-finish";

/** Cover reasons follow the same rules as early-finish reasons: required, trimmed, max 300 chars. */
export const normalizeCoverReason = normalizeEarlyFinishReason;

/** Accepts "HH:MM" (24h) and returns "HH:MM:00", or null when invalid. */
export function normalizeCoverUntil(value: unknown): string | null {
  // Optional ":SS" so an already-normalised "HH:MM:00" round-trips (client → server).
  const m = String(value ?? "").trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}:00`;
}

/** Cover must end later today (UK time). */
export function coverUntilIsValid(until: string, ukNowTime: string): boolean {
  return until > ukNowTime;
}

/**
 * Asks for the required cover reason and end time. Returns null if cancelled.
 * When presetUntil is given (staff/management/admin), the end time is taken
 * from today's business closing time and the staff member is not asked.
 * Moderators work their own hours, so they still enter the time themselves.
 */
export function askCoverRequest(presetUntil?: string): { reason: string; until: string } | null {
  let reason: string | null = null;
  for (let i = 0; i < 3 && !reason; i += 1) {
    const a = window.prompt(
      i === 0
        ? "You're not on the rota right now. Request to sign in to cover a shift — admin or management must approve it.\n\nReason for covering (required):"
        : "A reason is required so admin or management can see why.\n\nReason for covering (required):",
    );
    if (a === null) return null;
    reason = normalizeCoverReason(a);
  }
  if (!reason) return null;
  if (presetUntil) {
    const until = normalizeCoverUntil(presetUntil);
    if (until) return { reason, until };
  }
  let until: string | null = null;
  for (let i = 0; i < 3 && !until; i += 1) {
    const a = window.prompt("Cover until what time? (UK time, 24h e.g. 18:00) — required:");
    if (a === null) return null;
    until = normalizeCoverUntil(a);
  }
  if (!until) return null;
  return { reason, until };
}

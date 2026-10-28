/** Website → BM TV Enabler handoff rules (shared by the server function, public route and tests). */
export const HANDOFF_TTL_MS = 2 * 60 * 60 * 1000;

export type HandoffRow = { user_id: string; expires_at: string; used_at: string | null };

/** Ticket consent and TV choice are already answered; this is troubleshooting, not installation. */
export function ticketSupportHandoff(ticketId: string, device: "amazon" | "android") {
  return { purpose: "support" as const, ticketId, device, helpPlan: 1 as const, appPaths: [] as string[] };
}

/** Random 6-digit code (leading zeros kept). */
export function makeHandoffCode(): string {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function normalizeHandoffCode(input: string): string | null {
  const d = input.replace(/\D/g, "");
  return d.length === 6 ? d : null;
}

/** A code works once, within 2 hours, and only for the PIN login of the customer who made it. */
export function handoffUsable(row: HandoffRow | null, pinUserId: string | null, now = Date.now()): "ok" | "missing" | "used" | "expired" | "wrong_user" {
  if (!row) return "missing";
  if (row.used_at) return "used";
  if (Date.parse(row.expires_at) <= now) return "expired";
  if (!pinUserId || pinUserId !== row.user_id) return "wrong_user";
  return "ok";
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

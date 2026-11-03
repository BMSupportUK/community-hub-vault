/** Connections must stay over the subscription limit this long before BM Player reports it. */
export const CONNECTION_LIMIT_GRACE_MS = 3 * 60_000;
/** One investigation report per device in this window. */
export const CONNECTION_REPORT_COOLDOWN_MS = 30 * 60_000;

export function isSustainedConnectionExcess(input: { active: number; max: number; exceededSince: number; now: number }) {
  return input.max > 0 && input.active > input.max && input.exceededSince <= input.now - CONNECTION_LIMIT_GRACE_MS && input.exceededSince <= input.now + 60_000;
}
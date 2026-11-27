export const SECURITY_GATE_TTL_MS = {
  "shop-orders": 15 * 60_000,
  discounts: 15 * 60_000,
  player: 10 * 60_000,
} as const;

export type SecurityGate = keyof typeof SECURITY_GATE_TTL_MS;
export function gateExpiry(gate: SecurityGate, now = Date.now()) {
  return new Date(now + SECURITY_GATE_TTL_MS[gate]).toISOString();
}
export function gateOpen(until: string | null | undefined, now = Date.now()) {
  return !!until && Number.isFinite(Date.parse(until)) && Date.parse(until) > now;
}
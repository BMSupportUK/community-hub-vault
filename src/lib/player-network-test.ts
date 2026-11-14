/** Only complete, recent, explicitly identified broadband tests replace legacy traffic estimates. */
export function broadbandFields(test: { down: number; up: number; measured_at: number; method: string } | undefined, now: number) {
  if (!test || test.method !== "cloudflare-adaptive-v1" || test.measured_at > now + 60_000 || now - test.measured_at > 24 * 3600_000) return null;
  if (![test.down, test.up].every(n => Number.isInteger(n) && n > 0 && n <= 2_000_000)) return null;
  return { net_down_kbps: test.down, net_up_kbps: test.up, net_measured_at: new Date(test.measured_at).toISOString() };
}
export function hasBroadbandTest(platform: string, version: string | null) {
  const parts = version?.split(".").map(Number);
  if (!parts || parts.some(n => !Number.isInteger(n))) return false;
  const minimum = platform === "windows" ? [0, 4, 102] : platform === "mac" ? [0, 1, 105] : [5, 35, 0];
  for (let i = 0; i < 3; i++) { const difference = (parts[i] ?? 0) - minimum[i]; if (difference) return difference > 0; }
  return true;
}
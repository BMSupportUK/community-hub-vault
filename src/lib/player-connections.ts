/**
 * The provider (DNS player_api max_connections) is the source of truth for how many
 * connections a login has. The website package is the fallback, then what the app reported.
 */
export function pickConnections(provider: number | null, pkg: number | null, appReported: number | null): number | null {
  const ok = (n: number | null) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
  return ok(provider) ?? ok(pkg) ?? ok(appReported);
}

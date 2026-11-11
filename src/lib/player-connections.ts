/**
 * The provider (DNS player_api max_connections) and the website package (Single 1, Multi Room 2, Triple Room 3)
 * are both checked and the larger wins; what the app reported is only a last resort.
 */
export function pickConnections(provider: number | null, pkg: number | null, appReported: number | null): number | null {
  const ok = (n: number | null) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
  // Providers often report 1 for a Multi/Triple Room login, so the larger of provider and package wins.
  const known = [ok(provider), ok(pkg)].filter((n): n is number => n !== null);
  return known.length ? Math.max(...known) : ok(appReported);
}

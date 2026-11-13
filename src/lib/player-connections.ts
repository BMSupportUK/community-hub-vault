/**
 * The provider (DNS player_api max_connections) and the website package (Single 1, Multi Room 2, Triple Room 3)
 * are both checked and the larger wins; what the app reported is only a last resort.
 */
/** Packages are 1-3 connections; providers sometimes send a huge "unlimited" placeholder (e.g. 315368056), which is not a real count. */
export const MAX_PACKAGE_CONNECTIONS = 3;
export function realConnections(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= MAX_PACKAGE_CONNECTIONS ? Math.floor(n) : null;
}

export function pickConnections(provider: number | null, pkg: number | null, appReported: number | null): number | null {
  const ok = (n: number | null) => realConnections(n);
  // Providers often report 1 for a Multi/Triple Room login, so the larger of provider and package wins.
  const known = [ok(provider), ok(pkg)].filter((n): n is number => n !== null);
  return known.length ? Math.max(...known) : ok(appReported);
}

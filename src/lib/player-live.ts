/** BM Player live connections: presence rules shared by the check-in API and the admin page. */

/** Apps check in every 60s; a device unseen for longer than this is offline. */
export const LIVE_WINDOW_MS = 3 * 60_000;

export function isLive(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  return !!lastSeenAt && now - new Date(lastSeenAt).getTime() <= LIVE_WINDOW_MS;
}

type Watching = { kind: string; title: string; category?: string; player?: string; since: number } | null;

export function presenceUpdate(input: {
  now: number;
  lastSeenAt: string | null;
  connectedSince: string | null;
  login?: string;
  version?: string;
  watching: Watching;
  ip: string | null;
  cf: Record<string, unknown> | null;
  headerCountry: string | null;
}) {
  const nowIso = new Date(input.now).toISOString();
  const resumed = isLive(input.lastSeenAt, input.now) && input.connectedSince;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const w = input.watching;
  // The app clock may drift: never accept a start time in the future.
  const since = w ? new Date(Math.min(w.since, input.now)).toISOString() : null;
  return {
    last_seen_at: nowIso,
    connected_since: resumed ? input.connectedSince : nowIso,
    ...(input.login !== undefined ? { iptv_username: input.login || null } : {}),
    ...(input.version ? { app_version: input.version } : {}),
    watching_kind: w?.kind ?? null,
    watching_title: w?.title || null,
    watching_category: w?.category || null,
    watching_player: w?.player || null,
    watching_since: since,
    ...(input.ip ? { last_ip: input.ip.slice(0, 64) } : {}),
    ...(input.cf || input.headerCountry
      ? {
          geo_city: str(input.cf?.city),
          geo_region: str(input.cf?.region),
          geo_country: str(input.cf?.country) ?? str(input.headerCountry),
          geo_lat: num(input.cf?.latitude),
          geo_lon: num(input.cf?.longitude),
        }
      : {}),
  };
}

/** "1h 04m 09s" style running time. */
export function formatElapsed(fromIso: string | null | undefined, now = Date.now()): string {
  if (!fromIso) return "—";
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

/** Seconds of playback to credit on a check-in: the gap since the last one, only if something was playing and the app stayed live. */
export function watchCredit(input: { now: number; lastSeenAt: string | null | undefined; watchingKind: string | null | undefined }): { kind: string; seconds: number } | null {
  if (!input.watchingKind || !isLive(input.lastSeenAt, input.now)) return null;
  const seconds = Math.round((input.now - new Date(input.lastSeenAt as string).getTime()) / 1000);
  return seconds > 0 ? { kind: input.watchingKind, seconds: Math.min(seconds, LIVE_WINDOW_MS / 1000) } : null;
}

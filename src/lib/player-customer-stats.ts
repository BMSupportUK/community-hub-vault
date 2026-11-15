export const CUSTOMER_STATS_DAYS = 7;
export function customerStatsDays(now = Date.now()) {
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
 const base = Date.parse(`${today}T12:00:00Z`);
 return Array.from({ length: CUSTOMER_STATS_DAYS }, (_, i) => new Date(base - i * 86400000).toISOString().slice(0, 10));
}
export function customerStatsSegments<T extends { title: string; kind: string; seconds: number }>(rows: T[]) {
 const groups = new Map<string, { title: string; kind: string; seconds: number }>();
 for (const row of rows) {
  const key = `${row.kind}:${row.title}`, old = groups.get(key);
  groups.set(key, { title: row.title, kind: row.kind, seconds: (old?.seconds ?? 0) + Math.max(0, Number(row.seconds) || 0) });
 }
 const total = [...groups.values()].reduce((sum, row) => sum + row.seconds, 0);
 return [...groups.values()].sort((a, b) => b.seconds - a.seconds).map(row => ({ ...row, percent: total ? row.seconds / total * 100 : 0 }));
}
export type Strength = { level: 'strong' | 'ok' | 'weak' | 'very_weak' | 'none'; bars: 0 | 1 | 2 | 3 | 4; label: string };
/** Reported stream throughput bands, not Wi-Fi signal or broadband capacity. */
export function connectionStrength(avgKbps: number | null, bitrateKbps?: number | null): Strength {
 // A channel downloading 3 Mbps can play perfectly on 500 Mbps broadband.
 // Neither the transfer rate nor the stream bitrate establishes connection strength.
 return { level: 'none', bars: 0, label: avgKbps && avgKbps > 0 ? 'Stream download' : 'No reading' };
}
export function connectionDiagnosis(strength: Strength, buffers: number) {
 if (!buffers || strength.level === 'none') return null;
 return null;
}
export const mbps = (kbps: number) => `${(kbps / 1000).toFixed(kbps < 10000 ? 1 : 0)} Mbps`;
export function latestConnectionReading(
 row: { speed_latest_kbps: number | null; speed_latest_at: string | null; title: string; device_id: string; login: string },
 device: { id: string; watching_title: string | null; watching_preview: boolean; last_seen_at: string; iptv_username: string | null } | undefined,
 now = Date.now(),
) {
 if (!device || device.watching_preview || device.watching_title !== row.title || device.id !== row.device_id || device.iptv_username !== row.login) return null;
 const at = Date.parse(row.speed_latest_at ?? ''), seen = Date.parse(device.last_seen_at);
 if (!Number.isFinite(at) || !Number.isFinite(seen) || now - at > 180000 || now - seen > 180000 || at > now || seen > now) return null;
 return row.speed_latest_kbps && row.speed_latest_kbps > 0 ? row.speed_latest_kbps : null;
}

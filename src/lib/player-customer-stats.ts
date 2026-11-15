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
/** Five-minute reported playback reliability, never a broadband capacity diagnosis. */
export function playbackReliability(
 device: { id: string; watching_title: string | null; watching_preview: boolean; watching_since: string | null; last_seen_at: string } | undefined,
 events: { device_id: string; content_name: string; stall_ms: number; occurred_at: string; reconnected: boolean }[] | null,
 now = Date.now(),
): Strength {
 const unknown: Strength = { level: 'none', bars: 0, label: 'Awaiting playback evidence' };
 const since = Date.parse(device?.watching_since ?? ''), seen = Date.parse(device?.last_seen_at ?? '');
 if (!device?.watching_title || device.watching_preview || events === null || !Number.isFinite(since) || !Number.isFinite(seen) || seen > now || now - seen > 180000 || now - since < 60000) return unknown;
 const start = Math.max(since, now - 300000);
 const recent = events.filter(e => e.device_id === device.id && e.content_name === device.watching_title && Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= now);
 const stalled = recent.reduce((sum, e) => sum + Math.max(0, e.stall_ms), 0);
 const reconnects = recent.filter(e => e.reconnected).length;
 const ratio = stalled / (now - start);
 if (ratio >= 0.1 || reconnects >= 3) return { level: 'very_weak', bars: 1, label: 'Poor playback' };
 if (ratio >= 0.03 || reconnects >= 2) return { level: 'weak', bars: 2, label: 'Unstable playback' };
 if (recent.length) return { level: 'ok', bars: 3, label: 'Minor interruptions' };
 return { level: 'strong', bars: 4, label: 'Stable playback' };
}
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
export type ChannelLinkSnapshot = { ping_ms: number; stalls: number; reconnects: number; delivery_ratio: number };
/** Exact ChannelLink.java thresholds, using the same two-minute snapshot as the box. */
export function channelLinkRating(snapshot: ChannelLinkSnapshot | null): string | null {
 if (!snapshot) return null;
 const { ping_ms: ping, stalls, reconnects, delivery_ratio: ratio } = snapshot;
 if (ping < 0 && ratio < 0 && stalls === 0 && reconnects === 0) return 'Checking';
 if (reconnects > 0 || stalls >= 3 || ping > 400 || (ratio >= 0 && ratio < 0.9)) return 'Poor';
 if (stalls >= 1 || ping > 200 || (ratio >= 0 && ratio < 0.98)) return 'Fair';
 if (ping > 80) return 'Good';
 return 'Excellent';
}
export function readChannelLinkSnapshot(value: unknown): ChannelLinkSnapshot | null {
 if (!value || typeof value !== 'object') return null;
 const s = value as Record<string, unknown>;
 if (typeof s.ping_ms !== 'number' || typeof s.stalls !== 'number' || typeof s.reconnects !== 'number' || typeof s.delivery_ratio !== 'number') return null;
 return { ping_ms: s.ping_ms, stalls: s.stalls, reconnects: s.reconnects, delivery_ratio: s.delivery_ratio };
}

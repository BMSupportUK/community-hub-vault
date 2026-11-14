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
/** Average measured speed (kbps) against fixed bands; 3x the stream's bitrate also counts as Strong. */
export function connectionStrength(avgKbps: number | null, bitrateKbps?: number | null): Strength {
 if (!avgKbps || avgKbps <= 0) return { level: 'none', bars: 0, label: 'No reading' };
 if (avgKbps >= 25000 || (bitrateKbps && avgKbps >= bitrateKbps * 3)) return { level: 'strong', bars: 4, label: 'Strong' };
 if (avgKbps >= 10000) return { level: 'ok', bars: 3, label: 'OK' };
 if (avgKbps >= 5000) return { level: 'weak', bars: 2, label: 'Weak' };
 return { level: 'very_weak', bars: 1, label: 'Very weak' };
}
export function connectionDiagnosis(strength: Strength, buffers: number) {
 if (!buffers || strength.level === 'none') return null;
 if (strength.level === 'weak' || strength.level === 'very_weak') return "Customer's internet too slow";
 return 'Likely channel/provider issue';
}
export const mbps = (kbps: number) => `${(kbps / 1000).toFixed(kbps < 10000 ? 1 : 0)} Mbps`;

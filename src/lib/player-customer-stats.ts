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
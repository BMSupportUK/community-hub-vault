export type WatchActivity = { id: string; kind: string; title: string; category: string | null; platform: string | null; started_at: string; last_watched_at: string; seconds: number };
export const WATCH_ACTIVITY_LIMIT = 10;
export const WATCH_KINDS = [
  { key: "live", label: "Live TV", color: "var(--primary)", swatch: "bg-primary" },
  { key: "film", label: "Movies", color: "var(--success)", swatch: "bg-success" },
  { key: "series", label: "Series", color: "var(--warning)", swatch: "bg-warning" },
  { key: "catchup", label: "Catch up", color: "var(--accent)", swatch: "bg-accent" },
];

export function viewingSegments(rows: { kind: string; seconds: number }[]) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.seconds)), 0);
  return WATCH_KINDS.map(kind => {
    const seconds = rows.filter(row => row.kind === kind.key).reduce((sum, row) => sum + Math.max(0, Number(row.seconds)), 0);
    return { ...kind, seconds, percent: total > 0 ? seconds / total * 100 : 0 };
  });
}

export function latestWatchActivity(rows: WatchActivity[]) {
  return [...rows].sort((a, b) => Date.parse(b.last_watched_at) - Date.parse(a.last_watched_at)).slice(0, WATCH_ACTIVITY_LIMIT);
}

/** Credit is attached to the previous verified device owner and programme, not the incoming poll. */
export function watchActivityCredit(device: {
  id: string; user_id: string | null; watching_kind: string | null; watching_title: string | null;
  watching_category: string | null; watching_since: string | null; platform: string;
}, credit: { kind: string; seconds: number } | null, now: number) {
  if (!credit || !device.user_id || !device.watching_title?.trim() || !device.watching_since) return null;
  return { _device: device.id, _user: device.user_id, _kind: credit.kind, _title: device.watching_title,
    _category: device.watching_category ?? "", _platform: device.platform,
    _started: device.watching_since, _ended: new Date(now).toISOString(), _seconds: credit.seconds };
}

export function viewingDuration(seconds: number) {
  const minutes = Math.floor(Math.max(0, Number(seconds)) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : minutes ? `${minutes}m` : `${Math.max(0, Math.round(Number(seconds)))}s`;
}
export const WATCH_ACTIVITY_DAYS = 7;
const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
/** The latest 7 UK days (newest first), each with that day's activities newest first; empty days included. */
export function watchActivityByDay<T extends { last_watched_at: string }>(rows: T[], now = Date.now()): { day: string; rows: T[] }[] {
  const days: string[] = [];
  for (let i = 0; days.length < WATCH_ACTIVITY_DAYS; i++) { const d = ukDay(new Date(now - i * 86400000).toISOString()); if (!days.includes(d)) days.push(d); }
  return days.map(day => ({ day, rows: rows.filter(r => ukDay(r.last_watched_at) === day).sort((a, b) => b.last_watched_at.localeCompare(a.last_watched_at)) }));
}

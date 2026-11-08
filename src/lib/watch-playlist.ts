export type WatchTitle = {
  id: string; kind: 'movie' | 'series'; title: string; year: string | null;
  posterUrl: string | null; rating: number | null; overview: string;
};
export type WatchRow = Record<string, unknown>;
export function newestWatchRows(rows: WatchRow[], kind: WatchTitle['kind']) {
  function timestamp(row: WatchRow) {
    const value = kind === 'movie' ? row.added : (row.added ?? row.last_modified);
    if (value == null || value === '') return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return [...rows].sort((a, b) => timestamp(b) - timestamp(a));
}
export function watchCategoryIds(rows: WatchRow[], kind: WatchTitle['kind']) {
  const name = kind === 'movie' ? 'cinema' : 'recommended series';
  return rows.filter(r => String(r.category_name ?? '').trim().toLowerCase() === name).map(r => String(r.category_id));
}
export function mapWatchTitle(row: WatchRow, kind: WatchTitle['kind']): WatchTitle {
  const name = String(row.name ?? '').trim();
  const year = name.match(/\((\d{4})\)\s*$/)?.[1] ?? String(row.releaseDate ?? row.release_date ?? '').match(/^\d{4}/)?.[0] ?? null;
  const raw = Number(row.rating || Number(row.rating_5based) * 2);
  const poster = String(row.stream_icon ?? row.cover ?? '');
  let posterUrl: string | null = null;
  try { const u = new URL(poster); if (u.protocol === 'https:' && !u.username && !u.password && !u.search) posterUrl = u.href; } catch { /* missing poster */ }
  return { id: String(kind === 'movie' ? row.stream_id : row.series_id), kind,
    title: name.replace(/\s*\(\d{4}\)\s*$/, ''), year, posterUrl,
    rating: Number.isFinite(raw) && raw > 0 && raw <= 10 ? Math.round(raw * 10) / 10 : null,
    overview: String(row.plot ?? '').trim() };
}
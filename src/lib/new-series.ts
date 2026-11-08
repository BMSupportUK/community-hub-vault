import type { WatchTitle } from './watch-playlist';
export type NewSeries = WatchTitle & { premiereDate: string };
export type SeriesMonth = { month: number; name: string; items: NewSeries[] };
export type DiscoverySeries = { id: number; name?: string; first_air_date?: string; overview?: string; poster_path?: string | null; vote_average?: number; vote_count?: number };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function groupNewSeries(rows: DiscoverySeries[], today: string): SeriesMonth[] {
  const year = Number(today.slice(0, 4));
  const seen = new Set<number>();
  const groups = MONTH_NAMES.map((name, index) => ({ month: index + 1, name, items: [] as NewSeries[] }));
  for (const row of rows) {
    const date = row.first_air_date ?? '';
    const month = Number(date.slice(5, 7));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year || date > today || month < 1 || month > 12 || seen.has(row.id)) continue;
    if ((row.vote_average ?? 0) < 7 || (row.vote_count ?? 0) < 20 || !row.name || !row.overview) continue;
    seen.add(row.id);
    groups[month - 1]?.items.push({ id: String(row.id), kind: 'series', title: row.name, year: String(year), premiereDate: date, overview: row.overview, posterUrl: row.poster_path ? `https://image.tmdb.org/t/p/w500${row.poster_path}` : null, rating: Math.round((row.vote_average ?? 0) * 10) / 10 });
  }
  for (const group of groups) group.items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title));
  return groups;
}
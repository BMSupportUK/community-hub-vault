import type { WatchTitle } from './watch-playlist';
export type NewSeries = WatchTitle & { premiereDate: string };
export type SeriesMonth = { month: number; name: string; items: NewSeries[] };
export type DiscoverySeries = { id: number; name?: string; first_air_date?: string; overview?: string; poster_path?: string | null; vote_average?: number; vote_count?: number };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** How many year pills the New series screen offers, counting the current year. */
export const NEW_SERIES_YEARS_SHOWN = 6;
/** Year pills run newest first: the current year, then the years before it. */
export function newSeriesYears(currentYear: number, shown: number = NEW_SERIES_YEARS_SHOWN): number[] {
  return Array.from({ length: Math.max(1, shown) }, (_, index) => currentYear - index);
}
/** Past years run to their last day; the current year stops at today so nothing un-aired is offered. */
export function newSeriesCutoff(year: number, today: string): string {
  return year < Number(today.slice(0, 4)) ? `${year}-12-31` : today;
}
/** Past years need all twelve month lookups; the current year only the months already reached. */
export function newSeriesMonthCount(year: number, today: string): number {
  return year < Number(today.slice(0, 4)) ? 12 : Number(today.slice(5, 7));
}
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
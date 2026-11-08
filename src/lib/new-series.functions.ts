import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { groupPlaylistNewSeries, newSeriesCutoff, newSeriesYears, type SeriesMonth } from './new-series';
import type { WatchRow } from './watch-playlist';
let cache: { at: number; rows: WatchRow[]; adult: Set<string> } | null = null;
export const getNewSeries = createServerFn({ method: 'GET' })
  .inputValidator((data: { year?: number }) => ({ year: Number.isInteger(data?.year) ? data.year : undefined }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = Number(today.slice(0, 4));
    const years = newSeriesYears(currentYear);
    const currentMonth = Number(today.slice(5, 7));
    const year = data?.year && years.includes(data.year) ? data.year : currentYear;
    try {
      if (!cache || Date.now() - cache.at > 60 * 60_000) {
        const { playlistWatchRead } = await import('./playlist-source.server');
        const [categories, rows] = await Promise.all([playlistWatchRead('get_series_categories'), playlistWatchRead('get_series')]);
        if (!Array.isArray(rows)) throw new Error('Playlist unavailable');
        const adult = new Set((Array.isArray(categories) ? categories as WatchRow[] : []).filter(c => /adult|xxx|18\+/i.test(String(c.category_name ?? ''))).map(c => String(c.category_id)));
        cache = { at: Date.now(), rows: rows as WatchRow[], adult };
      }
      return { year, years, currentYear, currentMonth, months: groupPlaylistNewSeries(cache.rows, newSeriesCutoff(year, today), cache.adult), error: null as string | null };
    } catch { return { year, years, currentYear, currentMonth, months: [] as SeriesMonth[], error: 'The playlist is unavailable. Please try again shortly.' }; }
  });

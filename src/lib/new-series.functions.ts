import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { groupNewSeries, type DiscoverySeries, type SeriesMonth } from './new-series';
export const getNewSeries = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const key = process.env.TMDB_API_KEY;
  try {
    if (!key) throw new Error('Series discovery is not configured');
    const responses = await Promise.all(Array.from({ length: Number(today.slice(5, 7)) }, async (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      const last = new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10);
      const url = new URL('https://api.themoviedb.org/3/discover/tv');
      url.search = new URLSearchParams({ language: 'en-GB', with_original_language: 'en', sort_by: 'vote_average.desc', 'first_air_date.gte': `${year}-${month}-01`, 'first_air_date.lte': last < today ? last : today, 'vote_average.gte': '7', 'vote_count.gte': '20', without_genres: '99,10763,10764,10766,10767', include_adult: 'false', page: '1' }).toString();
      if (!key.startsWith('ey')) url.searchParams.set('api_key', key);
      const options: RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } } = { headers: key.startsWith('ey') ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(15000), cf: { cacheTtl: 21600, cacheEverything: true } };
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Series discovery failed (${response.status})`);
      return (await response.json() as { results?: DiscoverySeries[] }).results ?? [];
    }));
    return { year, months: groupNewSeries(responses.flat(), today), error: null as string | null };
  } catch { return { year, months: [] as SeriesMonth[], error: 'New series recommendations are unavailable. Please try again shortly.' }; }
});
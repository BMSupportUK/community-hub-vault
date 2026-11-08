import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { WatchTitle } from './watch-playlist';
export const getWatchPlaylist = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async () => {
  try {
    const { watchPlaylist } = await import('./watch-playlist.server');
    return { ...await watchPlaylist(), error: null as string | null };
  } catch { return { movies: [] as WatchTitle[], series: [] as WatchTitle[], error: 'The playlist is unavailable. Please try again shortly.' }; }
});
export const getWatchDescription = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ kind: z.enum(['movie', 'series']), id: z.string().regex(/^\d{1,15}$/) }))
  .handler(async ({ data }) => {
    try {
      const { watchDescription } = await import('./watch-playlist.server');
      return { overview: await watchDescription(data.kind, data.id), error: null as string | null };
    } catch { return { overview: '', error: 'The description is unavailable. Please try again.' }; }
  });
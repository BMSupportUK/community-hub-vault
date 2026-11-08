import { playlistWatchRead } from './playlist-source.server';
import { mapWatchTitle, watchCategoryIds, type WatchTitle, type WatchRow } from './watch-playlist';
import { createSharedCache } from './player-sports-cache';
const cached = createSharedCache<{ movies: WatchTitle[]; series: WatchTitle[] }>(60 * 60_000);
const details = new Map<string, { at: number; overview: string }>();
export async function watchPlaylist() {
  return cached(async () => {
    async function titles(kind: WatchTitle['kind']) {
      const categories = await playlistWatchRead(kind === 'movie' ? 'get_vod_categories' : 'get_series_categories');
      if (!Array.isArray(categories)) throw new Error('Playlist unavailable');
      const ids = watchCategoryIds(categories, kind);
      const groups = await Promise.all(ids.map(category_id => playlistWatchRead(kind === 'movie' ? 'get_vod_streams' : 'get_series', { category_id })));
      const rows = groups.flatMap(r => Array.isArray(r) ? r as WatchRow[] : []);
      const unique = new Map<string, WatchTitle>();
      for (const row of rows) {
        const item = mapWatchTitle(row, kind);
        if (item.title && /^\d+$/.test(item.id)) unique.set(item.id, item);
      }
      return [...unique.values()];
    }
    const [movies, series] = await Promise.all([titles('movie'), titles('series')]);
    return { movies, series };
  });
}
export async function watchDescription(kind: WatchTitle['kind'], id: string) {
  const list = await watchPlaylist();
  const item = (kind === 'movie' ? list.movies : list.series).find(t => t.id === id);
  if (!item) throw new Error('Title unavailable');
  if (item.overview || kind === 'series') return item.overview;
  const hit = details.get(id);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.overview;
  const row = await playlistWatchRead('get_vod_info', { vod_id: id });
  const overview = String(row?.info?.plot ?? row?.info?.description ?? '').trim();
  if (details.size > 300) details.clear();
  details.set(id, { at: Date.now(), overview });
  return overview;
}
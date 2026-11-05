/** Synced BM Player watch progress: films, episodes and series only; the newest update wins per title. */
export type ProgressItem = { key: string; position_ms: number; duration_ms: number; updated_at: number };

export const PROGRESS_KEY = /^(film|episode|series):[A-Za-z0-9._-]{1,80}$/;

/** Keep only incoming items that are newer than what is stored (or not stored yet). */
export function newerThanStored(incoming: ProgressItem[], stored: { item_key: string; updated_at: string }[]): ProgressItem[] {
  const have = new Map(stored.map(s => [s.item_key, new Date(s.updated_at).getTime()]));
  const latest = new Map<string, ProgressItem>();
  for (const i of incoming) {
    if (!PROGRESS_KEY.test(i.key)) continue;
    const prev = latest.get(i.key);
    if (!prev || i.updated_at > prev.updated_at) latest.set(i.key, i);
  }
  return [...latest.values()].filter(i => !(have.get(i.key)! >= i.updated_at));
}

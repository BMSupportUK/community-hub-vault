/** Shares one sports-guide answer across every BM Player request for `ttlMs`; concurrent misses share one load. */
export function createSharedCache<T>(ttlMs: number, now: () => number = Date.now) {
  let value: T | undefined;
  let at = 0;
  let inflight: Promise<T> | null = null;
  return async (load: () => Promise<T>): Promise<T> => {
    if (value !== undefined && now() - at < ttlMs) return value;
    if (inflight) return inflight;
    inflight = load()
      .then((v) => { value = v; at = now(); return v; })
      .finally(() => { inflight = null; });
    return inflight;
  };
}

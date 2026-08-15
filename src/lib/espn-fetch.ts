// Shared fetcher for the ESPN feeds.
//
// The live sync was reporting 50/50 failed ESPN requests: a single sync fired
// more outbound requests than the serverless worker allows per invocation, so
// they were all cut off. Callers now use date-range queries (a handful of
// requests instead of ~50) and go through this helper, which retries once on a
// transient failure and never throws — callers just get null.
//
// Note: ESPN rejects browser-style user-agent/referer headers with 403, so the
// request stays plain.

export async function espnJson<T = any>(url: string, tries = 2): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;
      // 4xx other than 429 will not fix themselves — stop early.
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // network blip — fall through to the retry
    }
  }
  return null;
}

/** ESPN date-range query string, e.g. 20260814-20260817. */
export function espnDateRange(fromMs: number, toMs: number): string {
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  return `${fmt(fromMs)}-${fmt(toMs)}`;
}

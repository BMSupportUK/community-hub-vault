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

// ESPN blocks a lot of serverless egress outright (403/451 with no body), which
// is why the deployed site kept showing empty match data while local dev worked.
// When the direct call is refused we retry the same URL through a read-only
// text mirror that returns the untouched JSON body.
async function viaMirror<T>(url: string): Promise<T | null> {
  const cached = mirrorCache.get(url);
  if (cached && Date.now() - cached.at < 15_000) return cached.value as T | null;
  try {
    // Use Jina's documented raw-text response header. `x-respond-with` is not
    // supported by this endpoint and caused the deployed worker fallback to
    // return no usable body even though it happened to work in local dev.
    const sourceUrl = url.replace(/^https:\/\//, "http://");
    const res = await fetch(`https://r.jina.ai/${sourceUrl}`, {
      headers: { accept: "application/json", "x-return-format": "text" },
    });
    if (!res.ok) {
      console.error("[espn-fetch] mirror failed", res.status, url);
      return null;
    }
    const text = await res.text();
    const parsed = JSON.parse(text) as any;
    // The mirror answers either the raw body or a wrapper: { data: { text } }.
    const inner = typeof parsed?.data?.text === "string" ? parsed.data.text : null;
    const value = (inner ? JSON.parse(inner) : parsed) as T;
    mirrorCache.set(url, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error("[espn-fetch] mirror error", String(error), url);
    return null;
  }
}

const mirrorCache = new Map<string, { at: number; value: unknown }>();

export async function espnJson<T = any>(url: string, tries = 2): Promise<T | null> {
  let lastStatus: number | string = "none";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;
      lastStatus = res.status;
      // 4xx other than 429 will not fix themselves on a direct retry.
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      lastStatus = String(error);
      // network blip — fall through to the retry
    }
  }
  console.error("[espn-fetch] direct request refused", lastStatus, url);
  return viaMirror<T>(url);
}

/** ESPN date-range query string, e.g. 20260814-20260817. */
export function espnDateRange(fromMs: number, toMs: number): string {
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  return `${fmt(fromMs)}-${fmt(toMs)}`;
}

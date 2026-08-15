// Shared fetcher for the ESPN feeds.
//
// The serverless worker was getting every ESPN request refused (the live score
// sync reported 50/50 failed fetches) because requests went out without a
// browser user-agent and because a single sync fired more subrequests than the
// worker allows. This helper adds the headers ESPN expects, retries once on a
// transient failure, and never throws — callers just get null.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function espnJson<T = any>(url: string, tries = 2): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-GB,en;q=0.9",
          "user-agent": UA,
          referer: "https://www.espn.co.uk/",
        },
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

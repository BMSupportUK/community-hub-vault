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
// Mirror providers are tried in order. r.jina.ai now rate-limits (429) and even
// answers 401 for keyless traffic, so it is last resort rather than the only
// path. Each provider gets a short cool-off after a failure so a burst of
// requests does not hammer a provider that is currently refusing us.
type MirrorProvider = {
  name: string;
  build: (url: string) => { target: string; init?: RequestInit };
};

const MIRROR_PROVIDERS: MirrorProvider[] = [
  {
    name: "cors.sh",
    build: (url) => ({
      target: `https://proxy.cors.sh/${url}`,
      init: { headers: { accept: "application/json" } },
    }),
  },
  {
    name: "codetabs",
    build: (url) => ({
      target: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
      init: { headers: { accept: "application/json" } },
    }),
  },
  {
    name: "jina",
    build: (url) => ({
      target: `https://r.jina.ai/${url.replace(/^https:\/\//, "http://")}`,
      init: { headers: { accept: "application/json", "x-return-format": "text" } },
    }),
  },
];

const providerCooldown = new Map<string, number>();
const COOL_OFF_MS = 60_000;

function parseMirrorBody<T>(text: string): T | null {
  try {
    const parsed = JSON.parse(text) as any;
    // Some mirrors answer the raw body, others a wrapper: { data: { text } }.
    const inner = typeof parsed?.data?.text === "string" ? parsed.data.text : null;
    return (inner ? JSON.parse(inner) : parsed) as T;
  } catch {
    return null;
  }
}

async function viaMirror<T>(url: string): Promise<T | null> {
  const cached = mirrorCache.get(url);
  if (cached && Date.now() - cached.at < 15_000) return cached.value as T | null;

  const now = Date.now();
  for (const provider of MIRROR_PROVIDERS) {
    const until = providerCooldown.get(provider.name) ?? 0;
    if (until > now) continue;
    try {
      const { target, init } = provider.build(url);
      const res = await fetch(target, init);
      if (!res.ok) {
        providerCooldown.set(provider.name, Date.now() + COOL_OFF_MS);
        console.error("[espn-fetch] mirror failed", provider.name, res.status, url);
        continue;
      }
      const value = parseMirrorBody<T>(await res.text());
      if (value == null) {
        providerCooldown.set(provider.name, Date.now() + COOL_OFF_MS);
        console.error("[espn-fetch] mirror returned unusable body", provider.name, url);
        continue;
      }
      mirrorCache.set(url, { at: Date.now(), value });
      return value;
    } catch (error) {
      providerCooldown.set(provider.name, Date.now() + COOL_OFF_MS);
      console.error("[espn-fetch] mirror error", provider.name, String(error), url);
    }
  }
  return null;
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

import { createFileRoute } from "@tanstack/react-router";

const TWEET_ID = /^\d{1,40}$/;
const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const OEMBED_URL = "https://publish.twitter.com/oembed";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAST_RETURN_MS = 1800;
const cache = new Map<string, { expires: number; data: unknown }>();
const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

export const Route = createFileRoute("/api/public/tweet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!TWEET_ID.test(id)) {
          return Response.json({ data: null, error: "Invalid tweet id" }, { status: 400 });
        }
        const cached = cache.get(id);
        if (cached && cached.expires > Date.now()) return json({ data: cached.data }, 200);

        const pageMediaPromise = getXPageMedia(id);
        const syndicationPromise = getSyndicationTweet(id, pageMediaPromise);
        const fallbackPromise = getOembedFallbackData(id, pageMediaPromise);

        // Production can occasionally stall on X's syndication endpoint. Start
        // the metadata scrape at the same time and return it as soon as it has
        // an image, instead of waiting several seconds before even trying it.
        const fastWithImage = await Promise.race([
          syndicationPromise.then((data) => (data && hasTweetMedia(data) ? data : null)).catch(() => null),
          fallbackPromise.then((data) => (data && hasTweetMedia(data) ? data : null)).catch(() => null),
          delay(FAST_RETURN_MS).then(() => null),
        ]);

        const data = fastWithImage ?? await firstSettledData(syndicationPromise, fallbackPromise);
        if (!data) return json({ data: null, error: "Tweet preview unavailable" }, 502);

        cache.set(id, { expires: Date.now() + CACHE_TTL_MS, data });
        return json({ data }, 200);
      },
    },
  },
});

function getToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function getSyndicationTweet(id: string, pageMediaPromise: Promise<string[]>): Promise<TweetLike | null> {
  const url = new URL(SYNDICATION_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("lang", "en");
  url.searchParams.set("features", FEATURES);
  url.searchParams.set("token", getToken(id));

  const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 2200);
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("application/json")) return null;

  const data = await res.json() as TweetLike & { __typename?: string };
  if (data?.__typename === "TweetTombstone" || Object.keys(data).length === 0) return null;
  return enrichTweetMedia(data, id, pageMediaPromise);
}

async function getOembedFallbackData(id: string, pageMediaPromise: Promise<string[]>): Promise<TweetLike | null> {
  const url = new URL(OEMBED_URL);
  url.searchParams.set("url", `https://x.com/i/status/${id}`);
  url.searchParams.set("omit_script", "true");
  url.searchParams.set("dnt", "true");
  url.searchParams.set("theme", "dark");

  try {
    const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 2200);
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("application/json")) {
      const pageOnly = await enrichTweetMedia({ __typename: "Tweet", id_str: id }, id, pageMediaPromise);
      return hasTweetMedia(pageOnly) ? pageOnly : null;
    }

    const embed = await res.json() as { html?: string; author_name?: string; author_url?: string; url?: string };
    const html = embed.html ?? "";
    const handle = embed.author_url?.match(/x\.com\/([^/?#]+)/i)?.[1];
    return enrichTweetMedia({
      __typename: "Tweet",
      id_str: id,
      text: htmlToTweetText(html),
      user: {
        name: embed.author_name,
        screen_name: handle,
      },
    }, id, pageMediaPromise);
  } catch {
    const fallbackData = await enrichTweetMedia({ __typename: "Tweet", id_str: id }, id, pageMediaPromise);
    return hasTweetMedia(fallbackData) ? fallbackData : null;
  }
}

async function firstSettledData(...promises: Array<Promise<TweetLike | null>>): Promise<TweetLike | null> {
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }
  return null;
}

function delay(ms: number) {
  return new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
}

type TweetLike = Record<string, unknown> & {
  photos?: Array<Record<string, unknown>>;
  mediaDetails?: Array<Record<string, unknown>>;
};

function hasTweetMedia(data: TweetLike | null | undefined): boolean {
  return !!(
    data?.photos?.some((photo) => typeof photo.url === "string" && photo.url) ||
    data?.mediaDetails?.some((media) => typeof media.media_url_https === "string" && media.media_url_https)
  );
}

async function enrichTweetMedia<T extends TweetLike>(data: T, id: string, pageMediaPromise?: Promise<string[]>): Promise<T> {
  if (hasTweetMedia(data)) return data;
  const pageMedia = await (pageMediaPromise ?? getXPageMedia(id));
  if (!pageMedia.length) return data;
  return {
    ...data,
    photos: [...(data.photos ?? []), ...pageMedia.map((url) => ({ url, expandedUrl: `https://x.com/i/status/${id}` }))],
    mediaDetails: [
      ...(data.mediaDetails ?? []),
      ...pageMedia.map((url) => ({ media_url_https: url, type: "photo", expanded_url: `https://x.com/i/status/${id}` })),
    ],
  };
}

async function getXPageMedia(id: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(new URL(`https://x.com/i/status/${id}`), {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0" },
    }, 3500);
    if (!res.ok) return [];
    const html = await res.text();
    const metaByKey = new Map<string, string>();
    const inlineByKey = new Map<string, string>();
    const add = (target: Map<string, string>, raw: string) => {
      const normalized = normalizeTweetImageUrl(decodeHtml(raw));
      if (!normalized) return;
      const key = tweetMediaKey(normalized);
      if (!target.has(key)) target.set(key, normalized);
    };
    for (const match of html.matchAll(/<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
      add(metaByKey, match[1] ?? "");
    }
    for (const match of html.matchAll(/https:\/\/pbs\.twimg\.com\/media\/[^"'<>\\\s]+/gi)) {
      add(inlineByKey, match[0] ?? "");
    }
    // The og:image/twitter:image meta tags are the only images X guarantees
    // belong to THIS tweet. Inline pbs.twimg.com matches also include unrelated
    // media (other tweets in the page payload, recommendations), which is why
    // extra images used to appear in the card. Only fall back to a single
    // inline match when the tweet page exposed no meta image at all.
    if (metaByKey.size) return Array.from(metaByKey.values()).slice(0, 4);
    return Array.from(inlineByKey.values()).slice(0, 1);
  } catch {
    return [];
  }
}

function normalizeTweetImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim().replace(/:(?:small|medium|large|orig)$/i, ""));
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Extract a stable identifier from a pbs.twimg.com media URL so we can dedupe
// the same image across og:image, twitter:image, and inline HTML matches that
// differ only by ?format=/&name= query parameters or file extension.
function tweetMediaKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\.(?:jpe?g|png|webp|gif)$/i, "");
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function htmlToTweetText(html: string) {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return decodeHtml(paragraph
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .trim());
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
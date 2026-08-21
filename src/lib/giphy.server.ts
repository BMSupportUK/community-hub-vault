import { z } from "zod";

export type GifResult = {
  id: string;
  title: string;
  preview: string;
  url: string;
  width: number;
  height: number;
};

export const searchInputSchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.number().min(1).max(50).default(24),
});

export const resolveInputSchema = z.object({ url: z.string().url().max(2000) });

const SHARE_HOSTS =
  /(^|\.)(tenor\.com|giphy\.com|gph\.is|media\.tenor\.com|media\d*\.giphy\.com|i\.giphy\.com)$/i;
const DIRECT_MEDIA = /\.(gif|gifv|mp4|webp|png|jpe?g)(\?|$)/i;

function mapResults(json: unknown): GifResult[] {
  const payload = json as { data?: unknown };
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.flatMap((item): GifResult[] => {
    const g = item as {
      id?: unknown;
      title?: unknown;
      images?: Record<string, { url?: string; width?: string; height?: string }>;
    };
    const full = g.images?.fixed_width?.url ?? g.images?.original?.url;
    if (!full) return [];
    const preview =
      g.images?.fixed_width_small?.url ??
      g.images?.preview_gif?.url ??
      g.images?.fixed_width?.url ??
      full;
    return [
      {
        id: String(g.id ?? full),
        title: typeof g.title === "string" && g.title ? g.title : "GIF",
        preview,
        url: full,
        width: Number(g.images?.fixed_width?.width ?? 200),
        height: Number(g.images?.fixed_width?.height ?? 200),
      },
    ];
  });
}

function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const first = html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    );
    if (first?.[1]) return first[1];
    const second = html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["']`,
        "i",
      ),
    );
    if (second?.[1]) return second[1];
  }
  return null;
}

function decodeHtmlUrl(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
}

export async function searchGiphy(
  input: z.infer<typeof searchInputSchema>,
): Promise<{ results: GifResult[]; error: string | null }> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return { results: [], error: "GIF service not configured" };
  const q = (input.q ?? "").trim();
  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${input.limit}&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${input.limit}&rating=pg-13&bundle=messaging_non_clips`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return { results: [], error: `GIF service error (${response.status})` };
    return { results: mapResults(await response.json()), error: null };
  } catch (error) {
    console.error("Giphy fetch failed", error);
    return { results: [], error: "GIF service unavailable" };
  }
}

export async function resolveGiphyUrl(rawUrl: string): Promise<{ url: string | null }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: null };
  }
  if (!/^https?:$/.test(parsed.protocol) || !SHARE_HOSTS.test(parsed.hostname))
    return { url: null };
  if (DIRECT_MEDIA.test(parsed.pathname)) return { url: parsed.toString() };

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return { url: null };
    const html = (await response.text()).slice(0, 400_000);
    const candidate =
      pickMeta(html, ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) ??
      html.match(/https:\/\/media\d*\.tenor\.com\/[^"'\s\\]+\.(?:gif|webp)/i)?.[0] ??
      html.match(/https:\/\/media\d*\.giphy\.com\/media\/[^"'\s\\]+\.(?:gif|webp)/i)?.[0] ??
      null;
    if (!candidate) return { url: null };
    const absolute = new URL(decodeHtmlUrl(candidate), response.url).toString();
    const mediaUrl = new URL(absolute);
    if (!SHARE_HOSTS.test(mediaUrl.hostname) || !DIRECT_MEDIA.test(mediaUrl.pathname))
      return { url: null };
    return { url: absolute };
  } catch (error) {
    console.error("resolveGifLink failed", error);
    return { url: null };
  }
}

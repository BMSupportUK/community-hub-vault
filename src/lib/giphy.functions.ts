import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GifResult = {
  id: string;
  title: string;
  preview: string; // small animated preview
  url: string; // full-size animated gif url
  width: number;
  height: number;
};

const SearchInput = z.object({
  q: z.string().max(100).optional(),
  limit: z.number().min(1).max(50).default(24),
});

function mapResults(json: any): GifResult[] {
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((g: any): GifResult | null => {
      const full = g?.images?.fixed_width?.url ?? g?.images?.original?.url;
      const preview =
        g?.images?.fixed_width_small?.url ??
        g?.images?.preview_gif?.url ??
        g?.images?.fixed_width?.url ??
        full;
      if (!full) return null;
      return {
        id: String(g.id),
        title: g.title || "GIF",
        preview,
        url: full,
        width: Number(g?.images?.fixed_width?.width ?? 200),
        height: Number(g?.images?.fixed_width?.height ?? 200),
      };
    })
    .filter(Boolean) as GifResult[];
}

export const searchGifs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }): Promise<{ results: GifResult[]; error: string | null }> => {
    const key = process.env.GIPHY_API_KEY;
    if (!key) return { results: [], error: "GIF service not configured" };
    const q = (data.q ?? "").trim();
    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${data.limit}&rating=pg-13&bundle=messaging_non_clips`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${data.limit}&rating=pg-13&bundle=messaging_non_clips`;
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        return { results: [], error: `GIF service error (${res.status})` };
      }
      const json = await res.json();
      return { results: mapResults(json), error: null };
    } catch (e) {
      console.error("Giphy fetch failed", e);
      return { results: [], error: "GIF service unavailable" };
    }
  });
const ResolveInput = z.object({ url: z.string().url().max(2000) });

const SHARE_HOSTS = /(^|\.)(tenor\.com|giphy\.com|gph\.is|media\.tenor\.com|media\d*\.giphy\.com|i\.giphy\.com)$/i;
const DIRECT_MEDIA = /\.(gif|gifv|mp4|webp|png|jpe?g)(\?|$)/i;

function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return m[1];
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return m2[1];
  }
  return null;
}

/**
 * Resolves a share link (e.g. the Tenor/Giphy URL the Windows GIF tray copies)
 * into a direct animated media URL that can be rendered with <img>.
 */
export const resolveGifLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    let parsed: URL;
    try {
      parsed = new URL(data.url);
    } catch {
      return { url: null };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { url: null };
    if (!SHARE_HOSTS.test(parsed.hostname)) return { url: null };
    if (DIRECT_MEDIA.test(parsed.pathname)) return { url: parsed.toString() };
    try {
      const res = await fetch(parsed.toString(), {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) return { url: null };
      const html = (await res.text()).slice(0, 400_000);
      const candidate =
        pickMeta(html, ["og:image", "twitter:image", "twitter:image:src"]) ??
        html.match(/https:\/\/media\d*\.tenor\.com\/[^"'\s\\]+\.gif/i)?.[0] ??
        html.match(/https:\/\/media\d*\.giphy\.com\/media\/[^"'\s\\]+\.gif/i)?.[0] ??
        null;
      if (!candidate) return { url: null };
      const abs = new URL(candidate, parsed.origin).toString();
      if (!DIRECT_MEDIA.test(new URL(abs).pathname)) return { url: null };
      return { url: abs };
    } catch (e) {
      console.error("resolveGifLink failed", e);
      return { url: null };
    }
  });

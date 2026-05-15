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
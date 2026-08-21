import { createServerFn } from "@tanstack/react-start";
import { resolveGiphyUrl, resolveInputSchema, searchGiphy, searchInputSchema, type GifResult } from "./giphy.server";

export type { GifResult };

export const searchGifs = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => searchInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ results: GifResult[]; error: string | null }> => searchGiphy(data));

/**
 * Resolves a share link (e.g. the Tenor/Giphy URL the Windows GIF tray copies)
 * into a direct animated media URL that can be rendered with <img>.
 */
export const resolveGifLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resolveInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ url: string | null }> => resolveGiphyUrl(data.url));

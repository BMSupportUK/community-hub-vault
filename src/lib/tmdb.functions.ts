import { createServerFn } from "@tanstack/react-start";

export type TmdbItem = {
  id: number;
  kind: "movie" | "tv";
  title: string;
  year: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number;
  voteCount: number;
  tmdbUrl: string;
};

type RawItem = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
};

function buildAuth(key: string): { headers: Record<string, string>; query: string } {
  // v4 tokens are JWTs (start with "ey"). v3 keys are 32-char hex.
  if (key.startsWith("ey")) {
    return { headers: { Authorization: `Bearer ${key}` }, query: "" };
  }
  return { headers: {}, query: `?api_key=${encodeURIComponent(key)}` };
}

function mapItem(raw: RawItem, kind: "movie" | "tv"): TmdbItem {
  const title = (kind === "movie" ? raw.title : raw.name) ?? "Untitled";
  const date = (kind === "movie" ? raw.release_date : raw.first_air_date) ?? "";
  return {
    id: raw.id,
    kind,
    title,
    year: date ? date.slice(0, 4) : null,
    overview: raw.overview ?? "",
    posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : null,
    backdropUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}` : null,
    rating: Math.round((raw.vote_average ?? 0) * 10) / 10,
    voteCount: raw.vote_count ?? 0,
    tmdbUrl: `https://www.themoviedb.org/${kind}/${raw.id}`,
  };
}

export const getTrending = createServerFn({ method: "GET" })
  .inputValidator((data: { window?: "day" | "week" }) => ({
    window: data?.window === "day" ? "day" : "week",
  }))
  .handler(async ({ data }) => {
    const key = process.env.TMDB_API_KEY;
    if (!key) {
      return { movies: [] as TmdbItem[], tv: [] as TmdbItem[], error: "TMDB_API_KEY not configured" };
    }
    const auth = buildAuth(key);
    const base = "https://api.themoviedb.org/3";
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`${base}/trending/movie/${data.window}${auth.query}`, { headers: auth.headers }),
        fetch(`${base}/trending/tv/${data.window}${auth.query}`, { headers: auth.headers }),
      ]);
      if (!mRes.ok || !tRes.ok) {
        return {
          movies: [] as TmdbItem[],
          tv: [] as TmdbItem[],
          error: `TMDB request failed (${mRes.status}/${tRes.status})`,
        };
      }
      const mJson = (await mRes.json()) as { results?: RawItem[] };
      const tJson = (await tRes.json()) as { results?: RawItem[] };
      return {
        movies: (mJson.results ?? []).map((r) => mapItem(r, "movie")),
        tv: (tJson.results ?? []).map((r) => mapItem(r, "tv")),
        error: null as string | null,
      };
    } catch (e) {
      return {
        movies: [] as TmdbItem[],
        tv: [] as TmdbItem[],
        error: e instanceof Error ? e.message : "TMDB fetch failed",
      };
    }
  });
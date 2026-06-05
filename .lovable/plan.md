## What to Watch page

A new page at `/what-to-watch` showing the current trending movies and series, pulled live from TMDB. Accessible to all approved users via a new icon in the left icon rail.

### Layout
- Tabs: **Movies** and **Series**
- Each tab shows a responsive grid of trending titles for the week
- Each card: poster, title, year, rating (★ score), short overview, and where applicable a genre chip
- Click a card → opens a detail dialog with larger poster, full overview, runtime/seasons, release date, and a link to its TMDB page
- Header includes a "Trending this week / Trending today" toggle

### Data source
TMDB API `/trending/movie/week` and `/trending/tv/week` (and `/day` variant for the toggle). Posters served from TMDB's CDN. Requires a free TMDB API key — I'll prompt you to add `TMDB_API_KEY` as a secret.

### Caching
A TanStack server function fetches from TMDB on the server (key stays server-side) and returns the trimmed list. Client uses TanStack Query with a 1-hour stale time so we don't hammer the API.

### Access & navigation
- Route: `src/routes/_authenticated/_approved/what-to-watch.tsx` (same gating as VPN / streaming devices)
- New icon (Popcorn / Clapperboard from lucide-react) added to `IconRail.tsx`

### Technical bits
- `src/lib/tmdb.functions.ts` — `getTrending({ kind: 'movie'|'tv', window: 'day'|'week' })` server fn, reads `process.env.TMDB_API_KEY`
- Route uses `queryClient.ensureQueryData` in loader + `useSuspenseQuery` in component (per project pattern)
- Styled with existing semantic tokens; cards reuse the same surface/card styles as Streaming Devices

### Out of scope
- No admin curation / pinning (pure live feed)
- No watchlist / favourites
- No deep filtering by genre/provider (can add later)

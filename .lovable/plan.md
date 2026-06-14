## Plan: Hot Right Now tabs on What to Watch

Restructure `src/routes/_authenticated/_approved/what-to-watch.tsx` so the page has two top-level tabs — **Trending** and **Hot Right Now** — each with its own Movies / Series sub-tabs.

### Backend (TMDB server function)

In `src/lib/tmdb.functions.ts`:
- Add a new server function `getHot` (mirroring `getTrending`) that calls:
  - `/movie/now_playing` → in cinemas now
  - `/tv/on_the_air` → currently airing this week
- Reuse the existing `buildAuth` / `mapItem` helpers and `TmdbItem` type.
- Same error-shape return as `getTrending` (`{ movies, tv, error }`).

### Frontend

In the What to Watch route:
- Wrap the page content in an outer `Tabs` with two triggers: `Trending` and `Hot Right Now`.
- Move the existing Today/This-week toggle + Movies/Series tabs inside the **Trending** TabsContent (no behaviour change).
- Inside **Hot Right Now** TabsContent, render Movies/Series sub-tabs powered by a new `useQuery(["tmdb-hot"], getHot)` call. No time-window toggle (Now Playing / On The Air are inherently "right now").
- Update the header copy/description to reflect the active top-level tab.
- Reuse the existing `Grid` component and details `Dialog` for both sections.

### Notes
- Pure presentation + one additional TMDB endpoint; no DB or schema changes.
- Uses the existing `TMDB_API_KEY` secret already wired into `getTrending`.

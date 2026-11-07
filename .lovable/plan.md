# Spread BM Player check-ins

Goal: when lots of people use BM Player at once, their apps' background calls to the website (sports guide, announcements, channel health, live-connection pings, reports) shouldn't all land in the same second.

## What changes
1. **Random spread on every repeating check-in.** Each app adds a small random offset (±20%) to each timer, so 1,000 boxes on a "every 60s" timer arrive spread across the minute instead of together.
2. **Staggered start on app open.** After opening, the first non-urgent check-ins (guide refresh, announcements, favourites/votes sync) wait a random 0–15 seconds. Login and the first channel list still load immediately.
3. **Back-off when busy.** If the website answers "busy" (429/503) or times out, the app waits longer before trying again (doubling, up to 5 minutes, with random spread), then returns to normal after a success.
4. **Website can slow apps down.** The player endpoint can send a "check again in N seconds" hint; apps obey it. Lets us ease load during a big match without an app update.
5. **Short shared caching** on the sports guide response (it's the same for everyone) so repeat calls are cheap.

Nothing changes for what users see; playback itself is untouched.

## Releases
Android 3.79, Windows 0.4.30, Mac 0.1.40, plus a website change. Exact timers to adjust will be confirmed from the code map before building.

## Technical details
- Shared helper per platform: `jitter(ms, 0.2)`, `backoff(attempt)` capped 300s, honour `Retry-After` / `next_poll_s` field.
- `src/routes/api/public/player.ts`: add `next_poll_s` to responses (default from an app setting), `Retry-After` on 429/503; in-memory 30s cache for the sports payload.
- Android: wrap Handler `postDelayed` schedules in MainActivity/PlayerActivity; Electron: wrap `setInterval` in `electron/main.cjs` with self-rescheduling `setTimeout`.
- Tests: jitter bounds, back-off cap/reset, Retry-After parsing (Android unit tests, desktop node checks, bun test for the server hint).

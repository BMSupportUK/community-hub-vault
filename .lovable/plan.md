## Goal
On the `/predictions` page, show the current **live score** and **minute elapsed** for any World Cup fixture that's currently being played, refreshing every 30 seconds. Finished matches keep showing the full-time score as today.

## What changes

### 1. Database (migration)
Add two columns to `public.wc_fixtures` so we can distinguish live vs finished and show the in-match minute:

- `status text` — values from football-data.org: `SCHEDULED`, `LIVE`, `IN_PLAY`, `PAUSED`, `FINISHED`, etc. Default `'SCHEDULED'`.
- `minute int` — current minute (e.g. `67`). Nullable.

Existing `home_score` / `away_score` keep their current meaning — they hold the latest known score whether the match is live or finished. No data migration needed; existing rows default to `SCHEDULED` and get updated on the next sync.

### 2. Sync hook
Update `src/routes/api/public/hooks/sync-wc-scores.ts`:

- Drop the `?status=FINISHED` filter so the request returns all WC matches.
- For each matched fixture, also write `status` and `minute` (from `m.status` and `m.minute`).
- Treat `IN_PLAY` / `PAUSED` / `LIVE` as live — write current score and minute.
- `FINISHED` writes the final score and clears `minute`.
- Everything else just updates `status`.

Bump the existing pg_cron schedule to **every minute** so the cache is at most ~60s stale (the hook is cheap and football-data.org's free tier allows it).

### 3. Predictions page
In `src/routes/predictions.tsx`:

- The TanStack Query that loads fixtures gets `refetchInterval: 30_000` **only when at least one fixture is live** (`status` in `LIVE` / `IN_PLAY` / `PAUSED`); otherwise no polling.
- Each fixture row that's currently live shows:
  - the live score in place of "TBD"
  - a red `LIVE 67'` pill next to the score (using the `minute` value; falls back to `LIVE` if minute is null, e.g. half-time / `PAUSED` shows `HT`).
- Finished matches show the same full-time score they already do.
- The sidebar score-entry inputs lock as soon as `status !== 'SCHEDULED'` (in addition to the existing 30-min-before-kickoff lock).

No new tables, no realtime channel, no new feed — uses the existing football-data.org integration and key.

## Out of scope
- No edits to /sports-guides.
- No realtime/websocket subscription (you chose 30s polling).
- No new live-score page outside /predictions.

## Technical notes
- Migration also widens grants only if needed; `wc_fixtures` already has the right policies — verify before adding any GRANT.
- Polling is conditional so idle users (no live match) don't generate background traffic.
- Football-data.org free tier rate limit is 10 req/min; 1 cron call/min plus opportunistic client refreshes via the cached DB row is well within that.

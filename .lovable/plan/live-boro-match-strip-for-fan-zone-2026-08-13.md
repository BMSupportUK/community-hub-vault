# Live Boro Match Strip for Fan Zone

Add a slim, always-visible match strip at the top of every Boro Fan Zone page — the board index, a board's topic list, and inside a topic (posts and replies) — that shows Middlesbrough's current or next game and updates itself in real time.

## What it shows

One compact horizontal bar (badge, teams, score/kick-off, competition):

- **Live game:** big score plus a pulsing "LIVE" dot and the minute/period, refreshing itself every ~20 seconds while play is in progress.
- **Pre-match (no game in play):** next fixture with a countdown to kick-off, and the last result on the right side.
- **Post-match:** final score with "FT" until the next fixture takes over.
- Tapping the strip opens the existing full Match Centre details (next fixture, last result, league position) in a dialog, so nothing is lost on small screens.
- Collapses to a single line on mobile; hidden entirely if there is no fixture data at all.

## How it fits in

The strip renders inside the shared Fan Zone shell, so it appears once above the panel on all three Fan Zone screens automatically, with the existing Boro red/black styling.

## Technical notes

- `src/lib/boro-match-centre.functions.ts`: extend `MatchCentreDTO` with a `liveMatch` block (home/away, scores, status detail, clock, competition, logos) sourced from the ESPN feeds already fetched there. Tighten the existing live-window cache so cached rows are considered stale after ~20 seconds while a match is in play; keep manual admin overrides untouched.
- New `src/components/app/BoroLiveMatchStrip.tsx`: calls `getBoroMatchCentre` via `useServerFn`, polls at 20s during a live window / 5 min otherwise, refetches on tab focus, and reuses `useUserTimezone` for kick-off formatting. Contains the dialog that renders the existing `BoroMatchCentreBox`.
- `src/routes/fan-zone.tsx`: render the strip in `FanZoneShell` above the content panel (covers index, board and topic routes).
- No database schema change; no new tables or policies.

## Out of scope

- Changing the existing sidebar Match Centre box behaviour.
- Adding the strip to the members-only forum at `/forum` (can be added later if wanted).

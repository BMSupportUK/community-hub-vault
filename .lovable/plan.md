# BM Player 2.23 — Sky-style TV guide

Replace the three-column TV guide (categories › channels › programmes) with a Sky-style grid.

## What the customer sees
```text
 [Category: All ▾]            Mon 2 Nov   22:00   22:30   23:00   23:30
 ┌────────────┬──────────────────────────────────────────────────────┐
 │ 101 Sky One│ The Simpsons      │ Brassic           │ News         │
 │ 102 BBC One│ Film: Heat (2/3 elapsed)               │ Weather│ ... │
 │ 103 ITV1   │ ...                                                  │
 └────────────┴──────────────────────────────────────────────────────┘
  Selected: Brassic  22:30–23:00            ▶ Watch / ⏰ Remind
  Small live preview of the highlighted channel, top-left (like Sky)
```
- Channels down the left (number + name + logo), time across the top in 30-minute columns, about 2 hours on screen.
- Programmes drawn as boxes sized by length; a red "now" line runs down the grid; shows already on are shaded.
- D-pad: up/down moves channel, left/right moves programme; pushing right past the edge scrolls forward in time, left scrolls back (not before now).
- Info strip at the top shows the highlighted programme's title and start–end time, plus a small preview of that channel playing.
- OK on a programme on now: Watch now. OK on a future programme: set/remove reminder (⏰ icon shown on the box). Already-started programmes still cannot get reminders.
- Category picker at the top (All first, then playlist categories); "+24h / Day" buttons jump forward a day, up to what the guide provides.
- Programme data loads per visible channel rows in the background and is cached, so scrolling stays smooth and the provider is not flooded.

## Unchanged
- Reminder pop-up and "Go to channel" button, reminders only from the TV guide, mini guide beside Live TV preview.

## Technical details
- New `GuideGridView` (custom View drawing rows/boxes on canvas) in `tv-player`, used by `showTvGuide()` in MainActivity; vertical RecyclerView-style recycling of rows.
- EPG via `get_short_epg` per channel (limit ~30), lazy for visible ±10 rows, LRU cache, max 3 concurrent requests on the existing io executor.
- Bump to 2.23 / versionCode 34, sign with BM key, upload APK first, then switch the build row; update tv-player/AGENTS.md guide rule.

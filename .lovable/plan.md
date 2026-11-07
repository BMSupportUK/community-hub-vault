# Sports Guide crosses only around event time

## What changes for you
- Channel lists on Sports Guide cards stay visible all day.
- A cross ("Not working right now – try another channel") only shows from **10 minutes before** an event starts until it ends. Before that, the channel shows normally with no cross.
- **Event channels** (ones that only carry events and are blank between them, e.g. "UFC 04 |", "MonoMax 27 | (Events Only)", "HBO Max UK | Event 1", "Boxing 03 | …") ignore problem reports sent while none of their events is on, so a blank channel tried early can't get marked.
- A shared event channel starts fresh 10 minutes before each event: only reports from that event's own time count, so a cross never carries over from an earlier event.
- Ordinary 24/7 channels (Sky Sports, TNT, etc.) keep today's behaviour: marked straight away.
- The admin Channel status list follows the same rules.
- Website only, no app updates.

## Technical details
- `src/lib/player-channel-health.ts`: add `CROSS_LEAD_MS = 10 min`, `isEventChannel(name)` (pattern: name ends in a bare `|`, contains "Events Only", "Event N", or a numbered event-feed prefix such as `UFC/Boxing/MonoMax/TrillerTv/DAZN NN |`), `eventWindowOpen(event, now)` (start − 10 min ≤ now ≤ end) and `crossForEvent(row/stalls, event, now)` that only counts problems/stalls at or after `start − 10 min`.
- `src/routes/api/public/player.ts` `channel_health`: for an event channel, accept a "failed"/"black" report only if some current guide event using that channel has its window open; otherwise ignore it. "ok" reports are always stored.
- `sports` response: per-event `unavailable` is worked out per event with `crossForEvent` (empty outside the window). The global `unavailable` list drops event channels, so apps that read the global list can't cross them early.
- `currentCrossedChannels` returns the raw rows/stalls so per-event filtering can use timestamps; keep its 30 s cache.
- `channelStatus` (admin list): event channels outside any open window show "Not checked" instead of Offline.
- Tests (`player-channel-health.test.ts`): no cross 11 min before start; cross 9 min before start after a report; report from an earlier event doesn't cross the next one; 24/7 channel crossed regardless of time; early report on an event channel is ignored.
- Update the Sports Guide crosses rule in `src/lib/AGENTS.md`.

# Smoother provider restarts + feed switch reports

## Part 1: Smoother provider restarts (new)

### Goal
When the provider restarts or drops a live stream, the player should come back as fast as possible and look like a short pause, not a breakdown.

### What changes (Android/Fire TV, Windows, Mac)
1. **Reconnect straight away.** When the provider ends a live stream, the first retry happens at once on every channel. At the moment only sports-pass and heavy channels get that; other channels wait a second.
2. **Keep the last picture.** The last picture stays on screen while the stream reopens, instead of going black.
3. **Quieter message.** "Reconnecting…" only shows if the stream isn't back within 3 seconds.
4. **Provider restarts don't push you to the backup player.** A restart that comes back and plays steadily for 30 seconds no longer counts towards the "give up and switch to backup" limit. Repeated failures still go to the backup player as now.
5. **Same address first.** Retry the same stream address once before trying the next one in the list, because a restarted provider stream usually comes straight back on the same address.

## Part 2: Feed switch reports for admins (approved earlier, not yet built)

On the BM Player buffering page, a new **Feed switches** tab lists one row per channel:
- Channel name and category
- Switches over 24 hours, 7 days or 30 days
- A breakdown by type: Picture, Sound, Timing, Frame rate, Provider restart
- How many turned into a stall
- Number of devices and the last time it happened

It's sorted by most switches first and visible only to admin and management. Players send switches with their existing buffering reports. Each device counts a channel at most once every 30 seconds per type, and records are cleared after 30 days.

## Releases
Publish the website, then release Android/Fire TV 4.57, Windows 0.4.97 and Mac 0.1.100 together, and confirm the live downloads match.

## Technical details
- Android `PlayerActivity`: `STATE_ENDED` live calls `reconnect(true)` for every channel; `PlayerView.setKeepContentOnPlayerReset(true)`; delay `reconnectNote` 3s via a posted runnable cancelled on READY; provider-cut reconnects tracked in a separate counter reset after 30s stable, excluded from `StreamRecovery.giveUp`; on cut, reopen `urlAt` once before advancing.
- Desktop `stream-recovery.cjs` `tick`: `state === 6` on live gives delay 0 for all; `session.cutReconnects` separate from `reconnects`, reset after 30s READY; `out.cause='provider_cut'`. main.cjs keeps the native surface (no clear) on reopen; the feed pill shows "Reconnecting…" only after 3s. Mac `<video>` keeps the poster frame via canvas snapshot until `playing`.
- New table `player_feed_switches` (device_id, content_id, content_name, category, switch_type, stalled, created_at) with grants, RLS, service-role insert, admin/management summary RPC `admin_feed_switch_summary(p_hours)`, 30-day cleanup.
- `src/lib/player-buffering.ts` accepts optional `switches[]` (zod, cap 50) on the `buffer` action; `player.ts` inserts under the device token.
- Android `markSwitch(type)` queue flushed by `BufferReporter`, 30s per-type dedupe; desktop `feedChange`/`advertJump` return type, queued via `queueBuffer`.
- New tab in `PlayerBufferingSection.tsx` using React Query.
- Tests: immediate cut retry for non-cushioned channels, cut counter excluded from give-up and reset after 30s, switch batch validation/cap, dedupe window.

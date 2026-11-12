# Report feed switches to admins

## Goal
Admins can see which channels change their picture, sound or timing most often, including switches the player rode through without a stall. That shows which feeds are badly behaved before customers complain.

## What admins see
On the existing BM Player buffering page, a new **Feed switches** tab lists one row per channel:
- Channel name and category
- Total switches over the chosen period (24 hours / 7 days / 30 days)
- A breakdown by type: **Picture**, **Sound**, **Timing**, **Frame rate**
- How many of those turned into a stall (the "Advert switch" count already recorded)
- Number of devices and the last time it happened

The list is sorted by most switches first. Only admin and management can see it.

## How it's collected
- Every time a player detects a switch on a live channel, it notes the channel and type.
- The players send these in small batches with the buffering reports they already send, so there's no extra traffic during playback.
- A channel that flips back and forth is counted at most once every 30 seconds per device, so one bad feed can't flood the list.
- Records older than 30 days are cleared automatically.

## Releases
The website goes live with a publish. Players need new versions: Android/Fire TV 4.57, Windows 0.4.97, Mac 0.1.100. Until boxes update, only stalled switches show up.

## Technical details
- New table `player_feed_switches` (device_id, content_id, content_name, category, switch_type enum-like text check via trigger, stalled bool, created_at). Service-role insert only, admin/management read via a role-checked summary RPC `admin_feed_switch_summary(p_hours int)`. Grants + RLS per project rules; 30-day cleanup in the existing buffer-events cleanup.
- `src/lib/player-buffering.ts`: accept an optional `switches: [{type, at}]` array on the existing `buffer` action (zod-validated, capped at 50 per batch); `src/routes/api/public/player.ts` inserts them under the device token.
- Android: `markSwitch(type)` records picture/sound/timing in a small queue flushed by `BufferReporter`; 30s per-type dedupe.
- Desktop: `stream-recovery.cjs` `feedChange`/`advertJump` return the type; `main.cjs` queues it into the existing `queueBuffer` flush.
- UI: new tab in `PlayerBufferingSection.tsx` reading the RPC via React Query.
- Tests: bun tests for batch validation/cap, dedupe window, and desktop type tagging.

# Make DAZN channels play more smoothly

## What last night showed
- BKFC on DAZN: 27 stalls (about 7 seconds each) and 6 times the stream stopped completely, all on one Android box.
- Other DAZN Canada channels (04, 18) showed the same pattern on that box; Triller and EPL channels stalled less.
- The player only starts recovering after 12 seconds of stall, so viewers sit watching a spinner first.

## The plan

1. **DAZN gets its own "steady" mode on Android, Windows and Mac**
   - Plays further behind live (about 30 seconds instead of 12), giving more cushion to ride out short provider drops.
   - Uses the larger buffer automatically on DAZN channels only, so other channels still start fast.

2. **Recover faster when DAZN stalls**
   - Reconnect after 6 seconds of stall on DAZN, not 12.
   - Reconnect straight away when the stream ends, picking up at the live point.

3. **Try the other stream format sooner**
   - After the first DAZN stall, switch between the two stream formats the provider offers and remember the steadier one for every device (already shared across all players).

4. **Automatic switch to another DAZN feed**
   - If a DAZN channel keeps failing (3 stalls in 2 minutes), offer "Try another feed" listing other channels showing the same event from the Sports Guide.

5. **Better evidence for next time**
   - Reports record which stream format and decoder were in use, so the admin Buffering page can show whether the problem is the provider feed or the box.
   - Admin Buffering page gets a DAZN filter showing stalls per channel per event, across all devices.

## What this cannot fix
If the provider's DAZN feed itself is broken, no player setting can repair it — the feed switch in step 4 is the fallback. If the reports show every device stalling at the same moments, the feed is at fault and it's worth raising with the provider.

## Releases
Android 3.81, Windows 0.4.31, Mac 0.1.41, plus a website update for the Buffering page. Real-box testing isn't possible here; you'd need to try a DAZN event on your box.

## Technical details
- `StreamRecovery` (Android) and `stream-recovery.cjs` (desktop): add `isDazn(name)` matching the canonicalized DAZN label; DAZN profile = buffer 40/90s, start 3s, live target 30s, stall reconnect 6s, format swap after 1 stall.
- `PlayerActivity`: apply profile in buffer config and `LiveConfiguration`; `STATE_ENDED` on live reconnects immediately at live edge.
- Alternative-feed offer: reuse Sports Guide event channel list passed via intent extras; desktop mirrors in main.cjs.
- `player_buffer_events`: add nullable `stream_format`, `decoder` columns (additive migration); `buffering` action accepts them; summary RPC gains channel filter.
- Tests for profile selection, timings and the feed-switch threshold beside existing StreamRecovery tests.

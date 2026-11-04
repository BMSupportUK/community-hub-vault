# BM Player: fewer buffering stalls (Android, Windows, Mac)

## What changes for customers
1. **Bigger safety buffer:** players load more video ahead before and during playback. Channels may take about a second longer to start, but short internet dips no longer freeze the picture. The existing buffer setting in Settings stays, with a new default of "Smooth".
2. **Silent auto-reconnect:** if Live TV, a film or an episode stalls or the stream drops, the player rejoins in the background. Films and episodes rejoin at the same spot. A small "Reconnecting…" note shows, and the customer only gets a message after several failed tries. Catch-up already does this, and that stays the same.
3. **Drop quality on weak internet:** if a stream offers several qualities, the player picks the lower one when speed falls and steps back up when it recovers. If a channel exists as both an HD and an SD channel and HD keeps stalling, the player offers "Switch to SD version?". Many providers only send one quality, and those streams can't be lowered.
4. **Buffering alert to staff:** each stall is recorded quietly with the channel or title, the device, the stall length and the internet speed. A new "Buffering" tab in Live BM Connections shows the worst channels and titles over the last 24 hours and 7 days. Staff get an alert when one channel stalls for many users at once, which points to a provider problem rather than one customer's internet.

## Releases
- New Android, Windows and Mac builds, signed and set as the current downloads, the same way as previous releases.
- The website side needs publishing before the staff Buffering tab and alerts go live.

## Technical notes
- **Android:**
  - Add a "Smooth" preset (minimum buffer of about 30 s and maximum of about 60 s), set by `DefaultLoadControl` in `PlayerActivity`.
  - Extend the catch-up retry pattern to all playback, with backoff (1 s, 2 s, 4 s and so on, up to 8 tries), resuming at the same position for films and episodes.
  - Cap HLS/DASH track selection by measured bandwidth.
- **Windows and Mac:**
  - Raise the default `network-caching` in `embedded-vlc.cjs` and the Mac equivalent.
  - Watch for VLC stall and error events and reload the media with the same backoff.
  - Pick the lower variant for adaptive streams.
- **Server:**
  - Add a `player_buffer_events` table (account, device, content id and name, seconds stalled, measured speed, time). Inserts go only through the device-token public player API; admin and management can read it.
  - Batch events on the device so stalls don't flood the server.
  - Add a grouped admin read and a threshold check that triggers the existing staff notification.
- Add tests for the backoff, quality-cap and event-batching logic on each platform, plus the server audience and permission rules.

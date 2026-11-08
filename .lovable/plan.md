# Bigger buffer for high-bitrate streams

Give every heavy stream (4K/UHD, FHD 50fps, and anything the player measures as high bitrate) the same steady profile DAZN and Coupang already use, on Android/Amazon, Windows and Mac.

## What customers will notice
- Heavy channels buffer less: 40–90 second buffer, sitting about 30 seconds behind live.
- Reconnects after 6 seconds stuck (instead of 12) and swaps stream format after the first stall.
- Heavy channels start a couple of seconds slower. Normal channels don't change.

## How a stream counts as "high bitrate"
1. **By name, before it starts:** UHD, 4K, 2160, FHD, 1080p50/60 or 50fps in the channel name.
2. **By measurement, while playing:** the player reads the real stream. If it's 1080p at 50/60fps, above 1080p, or 8 Mbps or more, that channel is marked as heavy.
3. **Remembered:** a channel measured as heavy is saved on that device, so next time it opens with the big buffer from the start. When a measured channel next reconnects, it switches to the big buffer.

## Safety
- Android keeps its current memory cap, so 4K buffers can't use so much memory that the app gets shut down on low-memory boxes.
- Catch up and films/series aren't affected.
- Buffering reports get a new "high bitrate" tag so the admin report shows whether it helps.

## Release
Android 3.94, Windows 0.4.41, Mac 0.1.51 (this also ships the Coupang buffer change that's still waiting), then check the downloads match.

## Technical details
- `tv-player/.../StreamRecovery.java`: add `isHeavyName(name)`, `isHeavyFormat(width, height, fps, bitrate)` (≥8,000,000 bps, height >1080, or height ≥1080 with fps ≥49), and widen `cushioned(name)` to include heavy names plus a device-saved heavy-channel set (SharedPreferences, capped at 500 entries).
- `PlayerActivity.java`: on `onVideoInputFormatChanged`/tracks change, run `isHeavyFormat`; if the stream is newly heavy, save it and use the cushioned profile on the next reconnect. `bufferBytes` memory cap stays unchanged.
- `windows-bm-player/stream-recovery.cjs` (shared with Mac): same name rule and `heavyFormat()`; measured data comes from libVLC track info on Windows and `<video>`/hls.js level bitrate on Mac; the heavy set is kept in the main-process store. Add `providerTag` value `high_bitrate`.
- Tests: Android `StreamRecoveryTest` and desktop `stream-recovery` tests cover name matching, format thresholds (1080p50 heavy, 1080p25 at 5 Mbps not heavy, 2160p heavy, 9 Mbps heavy) and remembered channels getting the large profile.
- Update the stream-recovery rule in `windows-bm-player/AGENTS.md` and the Android player rules.

# Live feed status indicator in BM Player

A small on-screen badge while watching that tells you the feed state instantly. Nothing shows while the feed is healthy — the picture stays clean.

## What it shows

- **Buffering…** — appears the moment the stream stalls, disappears when it recovers.
- **No picture** — appears when no video frame has rendered for 10 seconds after opening (the "black" case).
- Nothing otherwise. "Delayed" is skipped: a player has no live reference to compare against, so any delay reading would false-alarm.

## Changes

### Android (`tv-player/`)
- `PlayerActivity.java`: reuse the existing 10s no-rendered-frame check and `BufferReporter` stall state to drive a small overlay pill (top corner, above the video, hidden by default).
- `BackupPlayerActivity.java`: same pill while the backup engine plays.
- Bump to 3.73 / versionCode 184.

### Windows + Mac (`windows-bm-player/`, shared renderer per `mac-bm-player/AGENTS.md`)
- `electron/main.cjs`: the existing `healthTick` status loop already knows picture width and stall state — push a status message to the renderer.
- Renderer playback screen: small pill with the same wording, hidden when healthy.
- Bump Windows to 0.4.28, Mac to 0.1.38.

### Tests
- Android: unit tests for the pill state logic (stall → Buffering, 10s no frame → No picture, recovery → hidden).
- Windows/Mac: bun tests for the status-message mapping.

### Releases
- Build, sign (permanent BM key), upload and register Android 3.72→3.73, Windows 0.4.28, Mac 0.1.38 through the existing download endpoints.

## Not in scope
- No website/database changes — this is player-side only, using the health signals already built.
- No "delayed" detection (unreliable without a reference clock).

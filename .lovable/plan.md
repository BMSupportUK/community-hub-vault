# BM Player: anti-freeze (picture freezes and leftover buffering)

Today's update (Android 2.90, Windows 0.4.1, Mac 0.1.15) handles the spinning-wheel kind of buffering. This plan covers the other kind: the picture freezes while the sound carries on, or the stream silently stops without the player noticing.

## What changes for customers
1. **Frozen-picture fix on every channel, film and episode.** If no new picture is drawn for 4 seconds while playing, the player quietly reopens the stream. Live jumps back to "now"; films and episodes continue at the same spot. Catch-up already does this; now everything does.
2. **Stuck-at-live-edge fix:** if a live channel drifts far behind "now", which causes repeated short stalls, the player jumps back to the live point automatically.
3. **Best stream type chosen per channel:** if a channel keeps stalling as MPEG-TS, the player tries the HLS version of the same channel next time (and the other way round), and remembers what worked on that device.
4. **"Anti-Freeze" shown in Settings:** a box reading "Anti-Freeze: On", with a short line on what it does. It's always on, with nothing to configure.

## Limits to be honest about
- No app can stop buffering caused by the provider's server or a slow home connection. These changes make recovery fast and mostly invisible.
- The new Buffering section in Live BM Connections shows which channels still stall after this, so provider problems can be raised with the provider. It needs the website published.

## Releases
- Android 2.91, Windows 0.4.2 and Mac 0.1.16, signed and set as the current downloads.

## Technical notes
- **Android:** generalise PlayerActivity's catch-up `freezeWatch` (rendered-frame counter unchanged for 4 s while `isPlaying` and ready) to all playback.
  - Live reopens with `seekToDefaultPosition`; video on demand reopens at the saved position.
  - It shares the reconnect counter and back-off from StreamRecovery.
  - On live, if `currentLiveOffset` is more than 3× the target buffer, call `seekToDefaultPosition`.
  - Remember a per-channel preferred format (ts/hls) in prefs after 2 stalls, reordering `streamUrls`.
- **Windows:** use libVLC `media_player_get_time` (and the video frame count where available) unchanged for 4 s while state is 3 counts as a freeze, triggering reconnect through `stream-recovery.cjs`. Format preference is stored per channel in the encrypted store.
- **Mac:** the `<video>` `currentTime` unchanged for 4 s while not paused counts as a freeze.
- Freezes go to the same `buffering` events, with a `freeze: true` flag, so the staff view counts them.
- Add tests for freeze detection, the live-edge jump and format preference on each platform.

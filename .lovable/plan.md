# Stop advert-break buffering on Android / Fire TV

## Why it happens
When a channel switches to adverts, the provider stitches in a different video. It can change the picture size, the sound format or its internal clock. The player then pauses to sort itself out.

Right now the player only recognises an advert switch when the **picture size** changes. Last week's reports show 8 stalls tagged as adverts and 473 as "network drop" (about 8 seconds each). That suggests most advert switches are mistaken for a broken connection. The player then throws away its buffer and reconnects, and that is the long buffering you see.

Two other checks can make this worse:
- The 12-second (6s on heavy channels) "stuck buffer" check reconnects in the middle of the switch.
- The 4-second "picture frozen" check can mistake the short black gap between programme and adverts for a freeze and reopen the channel.

## What will change
1. **Spot advert switches properly.** A change in sound format, a jump in the stream's clock, or a change in the picture all count, not just picture size.
2. **Wait out the switch instead of reconnecting.** For a few seconds after a switch, the player keeps its buffer and lets the adverts load. It only reconnects if nothing arrives at all.
3. **Ignore the black gap.** A brief black or frozen frame right after a switch won't count as a freeze.
4. **Smoother handling of the switch in TS streams.** The player is set to cope with the clock resets that adverts cause.
5. **Better reports.** Advert stalls are tagged correctly, so the buffering admin page shows how many are really adverts.
6. Add checks for the new rules, then build and release Android / Fire TV 4.55.

Windows and Mac stay as they are for now. I can do the same there afterwards.

## Technical details
- `PlayerActivity`: set `formatChangedAt` from `onPositionDiscontinuity`, from audio/video `onTracksChanged` format changes, and from `AnalyticsListener.onAudioInputFormatChanged` / `onVideoInputFormatChanged`, not only from `onVideoSizeChanged`.
- `StreamRecovery`: add an advert grace period (around 10s). Inside it, `bufferWatch.retry` and `antiFreeze` skip reconnecting while the buffered position or audio is still moving. Use `ADVERT_WINDOW_MS` as the classification window.
- Media source: `DefaultExtractorsFactory.setTsExtractorFlags(FLAG_ALLOW_NON_IDR_KEYFRAMES | FLAG_DETECT_ACCESS_UNITS)` for live only; catch-up keeps its own player.
- Tests: extend `BufferReconnectInteractionTest` so a stall inside the advert grace window does not reconnect, and one with no progress after the grace window does.

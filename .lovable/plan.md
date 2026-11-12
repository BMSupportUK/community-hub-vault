# Ride through advert-break switches on ordinary channels

## Goal
When an ordinary (non-sports) channel goes into or comes out of an advert break, the picture and sound should carry on. No black screen, no restart to the start of the channel, and no long "Buffering…". This is a fix before it happens: nobody has reported it on a real channel yet.

## Why it can happen
At a break, the broadcaster often switches to a separate advert feed. The picture size, sound type or internal clock can suddenly jump. Right now the players treat a jump like that as a frozen or broken stream, so they may reconnect and throw away the buffer. That means a black picture and a wait.

## What changes (Android/Fire TV, Windows, Mac)
1. **Spot a break switch.** A short gap or clock jump while data is still arriving counts as a "feed change", not a fault.
2. **Don't reconnect for it.** Keep the current connection and buffer. Hold the last picture on screen until the new feed's first picture arrives. Give it up to 8 seconds before the normal recovery takes over.
3. **Sound follows.** If the sound type changes (for example stereo to surround), the sound restarts on the same screen without changing which screen is muted in Multi-screen.
4. **No scary message.** During that short window the pill stays empty. "Buffering…" only shows if nothing has arrived for more than 3 seconds.
5. **Real faults are unchanged.** If no data arrives at all, the existing recovery and backup player work exactly as they do now.

## Checks
- New automatic tests for each player: a clock jump with data still arriving doesn't trigger a reconnect, and a real stop still does after the existing limits.
- Run all existing player tests.
- Release Android/Fire TV, Windows and Mac together and confirm the live downloads match.
- Not testable on a real box from here, so a real-box check stays with you.

## Technical details
- Android: in `BufferRecoveryWatch` / ExoPlayer, handle `onPositionDiscontinuity` and format changes (`onTracksChanged`, `onVideoSizeChanged`, audio sink reinit) as a "feed change" grace period before any stall reconnect; enable keeping the last frame on screen.
- Windows (libVLC): pass `--ts-seek-percent`-free options plus `--no-ts-trust-pcr` style tolerance, and treat a VLC `ESAdded/ESDeleted/Vout` event burst with rising read bytes as a feed change in the displayed-picture freeze detector (still frame-counter based, per the existing rule).
- Mac (mpegts.js / hls.js): enable `fixAudioTimestampGap`, honour `#EXT-X-DISCONTINUITY` (hls.js already does), and don't reconnect on a `MEDIA_ERROR` decode reset if bytes are still arriving; use `recoverMediaError()` first.
- New grace window shared via `stream-recovery.cjs` (desktop) and a matching Java constant, with tests beside existing recovery tests.

# Coupang Play stop-starting on the box

## What I found
- Coupang Play gets more special handling in BM Player than almost any other channel: a bigger buffer, a "cushioned" live position, a check that jumps back to live when it falls behind, a check that reopens the channel when the picture freezes, and an adjustment that slows playback when the buffer runs low.
- In the last two days the box has sent **no** buffering reports for Coupang Play. So the stop-start isn't being counted as buffering. It's most likely BM Player's own safety checks jumping, reopening or slowing the stream. Other players such as XCTV don't do any of that. They just play what the provider sends.
- The cause isn't confirmed yet, so step 1 is to prove it.

## Plan
1. **Find the cause.** Add a short diagnostic note to each Coupang play. It records every time BM Player itself jumps to live, reopens the channel, changes speed or refills its buffer, and sends that with the existing reports. Then check a real Coupang session to see which one lines up with the stop-start.
2. **Make Coupang play "plain", like other players.** For Coupang Play channels only:
   - no automatic jump back to live (it plays steadily a little behind)
   - no slow-down/speed-up when the buffer is low
   - the frozen-picture reopen waits much longer (Coupang event feeds often hold a still picture), so a short still never restarts it
   - the large buffer stays as it is
3. Keep every other channel exactly as it is now.
4. Add tests for the Coupang-only rules: no drift jump, no speed range, longer freeze wait, and other channels unchanged.
5. Release box 6.36 on the permanent key. If the diagnostic shows the same thing on desktop, update Windows/Mac to match.

## Technical details
- StreamRecovery: add `plainLive(name)` = isCoupang. With it, `drifted()` returns false, `hlsLiveSpeeds()` returns null, and freeze ticks rise from 4 to around 15 for these channels. The same applies in LiveReconnect/LiveRideThrough for libVLC (full screen starts in libVLC first).
- Diagnostics go through the existing `feed_switches` action with new types (`self_jump`, `self_reopen`, `speed_ease`), so no new table is needed.
- Update the tv-player AGENTS.md sports-pass recovery rule to match.

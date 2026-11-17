# Catch up: Fast forward button

## Why not "jump to next programme"
The guide's start times are slot times, and recordings often start early, so the end of the previous show is often still playing. Jumping to the next guide slot would skip the whole programme you picked and drop you into the next one. The recording has no marker for where the programme really starts, so the box can't jump straight to it. Catch up recordings also can't scrub in place. Every move reopens the recording at a new minute, which is why each press currently takes a moment.

## What to build instead
Replace "Skip ahead 2 min" with a proper **⏩ Fast forward** button on catch up (both the main and backup players, all Android boxes/phones):
- Each press adds 1 minute, and presses stack: three quick presses show "⏩ +3 min" on screen.
- The recording only reopens once, about 1.5 seconds after your last press. You can tap your way to the start with a single wait, not one reload per press.
- Holding the button (or the remote's fast-forward/Right key while the button is selected) keeps counting up quickly.
- A small **⏪ Back 1 min** button sits beside it in case you overshoot. It never goes earlier than the listed start, because that only replays the previous show.
- Where you land is still remembered for that channel, so next time it opens at the real start.
- The Settings help text is updated to mention Fast forward.

## Release
Box version 6.10, signed with the usual key, uploaded and set as current.

## Technical details
- PlayerActivity.java and BackupPlayerActivity.java: the catch up skip button becomes FF and Back. A pending-minutes counter is debounced 1500ms, then one reopen at offset + pending via the existing timeshift reopen path. The started flag is reset as now.
- CatchupStart.offsetFor still saves the final offset. The lower clamp is the listed start.
- Unit test for the debounce/stacking math and the clamp.
- Update the catch up rule in tv-player/app/src/main/java/AGENTS.md.

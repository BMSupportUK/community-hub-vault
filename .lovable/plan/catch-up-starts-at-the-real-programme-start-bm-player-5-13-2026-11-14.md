# Catch-up starts at the real programme start (BM Player 5.13)

## What's happening now
Each catch-up programme already opens at the start time in the provider's guide. A show can still begin early for three reasons: channels run late, the guide time is only the slot time, and many providers add a few minutes of padding before the recording. Catch-up also has no fast forward or rewind, so there's no way to skip the extra bit.

## What changes
1. **Fast forward and rewind on catch-up**: the same skip buttons as films and episodes, so the viewer can jump past the end of the show before.
2. **"Catch-up starts" setting** in Settings with Exact guide time, +1, +2, +3 or +5 minutes. Every catch-up programme opens that many minutes after its listed start. The setting is saved on that box, and +2 minutes is the default because providers often pad by about that much.
3. **"Skip to listed start" button** for a few seconds at the start of each catch-up programme, in case the setting lands too late on a show.
4. **Recording length**: the requested length grows by the same number of minutes, so the end of the show is never cut off.

Live TV, films and series stay as they are.

## Technical details
- `catchupUrl()` gets the start offset from prefs (`catchup_offset_min`) and passes it to PlayerActivity, which seeks there once the timeshift stream is ready. The offset is not added to the URL time, because providers round URL times to the minute. `mins` grows by the offset.
- PlayerControls allows seek for `catchup`. The reconnect resume position already follows the seek.
- New test for the offset seek and the default value. Update the catch-up rule in the player AGENTS.md.
- Bump the version to 5.13, build, sign, upload and switch the public download, then check the download matches the build.

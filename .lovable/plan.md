# Make Live TV ride through advert breaks and picture/sound changes

## How it works now (5.02)
- The new Live TV engine (same kind Smarters uses) copes with ad breaks and picture/sound changes on its own: it rebuilds the picture and sound when the feed changes size, frame rate or audio type. That's the main reason it plays VIP Cinema where the old player jammed.
- It shows "Buffering…" if the feed pauses and logs freeze reports.
- Gaps: it does not watch for a picture that freezes while the sound carries on (only for the feed stopping), it doesn't reconnect by itself on errors in full screen beyond falling back to the old player, and a 5.1 to stereo switch at an advert could drop or change the audio track you picked.

## Proposed 5.03
1. Frozen-picture watch in full screen and Multi-screen: if no new pictures for 4 seconds while sound/feed continues, reopen the channel quietly in the same engine (up to 3 times) before trying the old player.
2. Auto-reconnect: when the feed ends or errors (common at ad-break joins), reconnect the same channel up to 3 times before giving up.
3. Keep the chosen audio track: if the sound format changes, reselect the same language/track; fall back to the default if it's gone.
4. Keep the 50Hz/frame-rate switch matched when the picture rate changes mid-channel (Android TV boxes only).
5. Tests for each rule beside the existing player tests; signed release, public download.

Films, episodes and catch up stay on the original player, unchanged.

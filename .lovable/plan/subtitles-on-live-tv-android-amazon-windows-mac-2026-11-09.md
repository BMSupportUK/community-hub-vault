# Subtitles on Live TV (Android/Amazon, Windows, Mac)

## Step 1: check how many channels carry subtitles
Before anything is built, test a sample of your Live TV channels (UK entertainment, news, sport, kids) and report how many actually send subtitles. If almost none do, we stop here and nothing is changed.

## What the customer gets (only if enough channels carry them)
- A **Subtitles** button in the Live TV player controls (next to the existing audio/track buttons).
- Pressing it lists the subtitle tracks the channel actually sends (e.g. "English", "English CC"), plus **Off**.
- Live TV starts with subtitles **off**; no pop-up question when changing channel (unlike films/episodes, which keep their current "subtitles found, keep them?" behaviour).
- The choice is remembered: once turned on, each next channel picks the same language automatically if it has one.
- If a channel sends no subtitles, the button shows "No subtitles on this channel" instead of an empty list.
- Works in both the main player and the backup player on Android/Amazon.

## Important limit
Subtitles only appear when the provider includes them in the channel stream. Many IPTV live channels carry none, so some channels will always show "No subtitles". We can't create subtitles for channels that don't send them (live AI captions would be a separate, much bigger job).

## Technical details
- Android `PlayerActivity` / `BackupPlayerActivity`: for live items stop forcing `TRACK_TYPE_TEXT` disabled; enable CEA-608/708 caption extraction for TS/HLS; add Subtitles action to `PlayerActionControls` using a track-selection dialog (D-pad friendly, `resultList()` style); persist preferred language in prefs and apply via `setPreferredTextLanguage`.
- Windows/Mac: reuse existing `subtitleTrack` control in `player-controls.jsx` / `mac-video.jsx`; show it for live items too and skip the `subs-found` modal when the item is live; remember the chosen language.
- Add tests beside existing Android tests (live defaults off, remembered language applied, "no subtitles" state) and desktop tests.
- Release: Android version bump + build row, Windows and Mac repackaged and registered as current.

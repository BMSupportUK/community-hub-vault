# Sports Guide: mark channels that aren't working

## What users will see
- On each Sports Guide card, a channel that isn't working right now gets a red cross beside its name. The text "Not working right now – try another channel" appears with it.
- Channels that are working stay as they are now.
- The cross clears by itself once the channel plays properly again.
- This works the same on Android/Amazon, Windows and Mac.

## How a channel gets a cross
Two checks work together.

**1. Website checks using your separate test login**
- You create a provider login that is only used for testing and add it in the admin dashboard. It's stored privately.
- Every 5 minutes, the website opens each channel on today's Sports Guide cards one at a time. It reads about 8 seconds of each and then closes it, so the test login only ever uses one viewer.
- A channel gets a cross if it won't open, or if it opens but sends no picture data.
- That login must never be given to customers. If someone is watching on it, the checks can't run.

**2. Reports from the players**
These catch problems the website check can miss, like a picture that is completely black:
- The channel won't open (a playback error, or it moves to the backup engine and that fails too).
- It opens but shows a black screen with no picture for about 10 seconds.
- It keeps cutting out: 3 or more stalls in 5 minutes.

A channel gets a cross when any BM Player has reported one of these in the last 15 minutes. The cross comes off as soon as any player plays that channel cleanly for 2 minutes.

"About 10 minutes behind" can't be detected reliably, so it isn't covered.

## Admin
- The Buffering page gets a "Channels marked not working" list, with an admin-only "Clear" button for each channel.

## Technical details
- Test login saved as private settings (`CHANNEL_CHECK_USERNAME`/`PASSWORD`). A scheduled job calls a protected `/api/public/channel-check` route, which streams each linked channel's TS for about 8 seconds and checks that video packets arrive.
- New table `player_channel_health` (channel name, status, last problem, last good playback, reporter count). Admin can read every row. Players get only the current crossed list, through a server function.
- Players send "failed", "black screen" and "played clean" events on the existing report path. Stalls already reach `player_buffer_events`.
- The sports-guide feed adds an `unavailable: true` flag to each crossed channel, so no further app update is needed to start or stop marking channels.
- One app update draws the cross and message: Android 3.72, Windows 0.4.27, Mac 0.1.37. The website guide preview shows them too.
- Add tests for the 15-minute window, the 3-stalls-in-5-minutes rule and the clean-play clear.

# Faster playlist and TV guide loading on Windows (and Mac)

## What is slow today
- The playlists themselves are only 6 downloads (Live TV, Films, Series, each with its own category list), one after another.
- The slow part is the **TV guide**. After the playlists, the app asks the provider for each channel's listings one at a time (8 at once). With thousands of channels, that's thousands of requests, and the locked "Loading TV guide… please wait" screen stays up until every one has finished. That is the minutes you're waiting.
- There's also some slow sorting when channels and films are matched to their categories on large playlists.

## Plan
1. **Measure first.** Time each step of a refresh (each playlist download and the whole guide) and send the times with the existing PC fault notes. Then we know the real split on your PC before and after.
2. **Load the whole TV guide in one download.** Providers offer the full guide for every channel as a single file. Download and read that once instead of thousands of separate requests. You still get the full guide for every channel at startup (your existing rule). If a provider doesn't offer the file, or it fails, fall back to the current per-channel loading.
3. **Show the app straight away using what's already saved.** If a guide and playlists were saved from last time, open on them right away and update quietly in the background, with no locked screen. The locked screen only shows on the very first load. Playlists still download one at a time (no return of the parallel downloading that caused the hangs). Only Live TV is kept in the screen's memory, as now, so the memory crash can't come back.
4. **Speed up category matching** so large film and series lists sort in a fraction of the time.
5. Release Windows 0.4.146 and Mac 0.1.137 after the checks pass.

## What you'll notice
- After the first time, the app opens to channels within a few seconds while it updates in the background.
- A full refresh should take seconds to well under a minute instead of minutes. Step 1 will confirm the real numbers on your PC.

## Technical details
- Guide: `xmltv.php?username&password` through the same `nativeVpn.fetch` helper. Stream-parse the XML in the main process (no whole-file DOM), group programmes by `tvg-id`/`epg_channel_id`, and hand the renderer only the rows its EPG cache already expects. Per-channel `get_short_epg`/`get_simple_data_table` stays as the fallback. Saved once after a full load (existing rule), never on a timer.
- Instant start: the encrypted per-login saved catalogue in the main process, used only when the stored login matches. The renderer still receives Live TV only; Films/Series come from main-process memory.
- Category lookup: build a `Map` of category id to name once per section instead of `cats.find` for every item.
- Tests: XML guide parsing/grouping, fallback when xmltv fails, saved-copy start without a locked screen, category name mapping.

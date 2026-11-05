# Live TV on TV boxes: guide layout from the photo

This applies to Amazon Fire TV, Android TV and Google TV boxes. Phones stay exactly as they are.

## What the screen looks like
```text
+---------------------------+----------------------------------------+
|                           |  [Search TV] [Voice search]     (top right)
|   PREVIEW BOX             |  Programme title                       |
|   (family picture until   |  18:00 - 19:00  ======----  50 min left |
|    a channel is chosen)   |  Description (up to 3 lines)           |
|                           |  Next: 19:00 Sports Centre   ☆  Category|
+---------------------------+----------------------------------------+
| Thu, 5 Nov, 18:10   18:00      18:30      19:00      19:30   20:00  |
| 1 [logo] Sky Sports News   | The Premier League Show | Sports Centre|
| 2 [logo] ...               | ...                                     |
| (Sky-style grid; a blue line marks the time now)                    |
+---------------------------------------------------------------------+
 [☰ Channels] tab on the left edge slides out categories, then channels
```

- **Preview (top left):** shows our family-on-the-sofa picture until you press OK on a channel. Highlighting a channel never starts a preview on its own.
- **Programme info (top right):** follows the highlighted programme. It shows the title, start and end time, a progress bar with the minutes left, the description, then a "Next:" line with the next programme's time and title. The channel's category and a favourite star sit on the right.
- **Guide grid (bottom):** today's date and time, time markers across the top, numbered channels with their logos, and programme blocks with a line marking the time now. You can move up, down, left and right through it with the remote. The catch-up clock still shows on channels that have catch up.
- **Slide-out categories:** the left-edge "☰ Channels" tab opens the categories panel, which slides across to that category's channels, the same as on phones. Back closes it.
- **Search buttons:** Search TV and Voice search sit as two small pills in the top-right corner, above the programme info. That space is empty in the photo, so they never cover the preview or the guide. The separate EPG button goes, because the guide is now always on screen.
- **Remote:**
  - OK on a programme that's on now previews it, and OK again opens the play menu.
  - Press Up from the top row of the guide to reach the search pills.
  - Back closes the categories panel if it's open, otherwise it goes Home.

## What gets removed
- The two Smarters-style screens from 3.14 (category tiles, then the channel list), which this layout replaces.

## Release
- Build and release Android 3.15.

## Technical details
- In `MainActivity.browse("live")`, boxes route to `showTvGuide(cat, true)`, the same screen phones use. On boxes, keep the `GuideGridView` visible below the preview. The phone-only "View EPG" pop-up and the hidden-grid behaviour stay phone-only (`smallestScreenWidthDp < 600`).
- Top row on boxes: the preview frame (16:9, about 40% width) beside a new info panel bound to the grid's focus listener. `LiveNowNext.pick` supplies the "Next:" line. A thin `ProgressBar` shows elapsed time, with minutes left as text. The description comes from `get_short_epg` and is cached per channel along with the line-up.
- The search pills move into the info panel's top-right corner on boxes. A D-pad Up from the first guide row moves focus there.
- Delete `showLiveCategories`, `showLiveChannel` and their `lv*` fields. Keep `LiveNowNext` and its tests.
- Update the screen rule in `tv-player/app/src/main/java/uk/bmsupport/player/AGENTS.md`, run all Android checks, then build and sign 3.15 with the BM key, upload it, set it as current and verify the download.

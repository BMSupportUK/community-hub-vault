# Smarters-style Live TV for Android and Amazon boxes

This applies to TV boxes only (Amazon Fire TV, Android TV, Google TV). Phones keep the layout they have now.

## Screen 1: picking a category (matches the first screenshot)
- **Left column:** a "Search in categories" box, then rows for All, Favourites, Channels history and every provider category, each with its channel count. The highlighted row is filled in the accent colour.
- **Right side:** the chosen category's name as a heading, with its channels in a grid of tiles (logo plus name, five across).
- **OK on a channel tile:** opens Screen 2 on that channel.
- **OK on a category:** opens Screen 2 on that category's first channel.

## Screen 2: watching a channel (matches the second screenshot)
- **Top bar:** the existing EPG, Search TV and Voice search buttons, unchanged, plus the time and date.
- **Left:** a "‹ Category name ›" bar, where Left/Right steps through categories. Below it, a numbered channel list with each channel's logo, name and the programme on now.
- **Middle top:** the preview box. The family picture shows until a channel is chosen. Previews still never start just from highlighting a channel.
- **Right top, beside the preview:** a "LIVE TV" badge, the channel name, then:
  - **Now:** the start and end time and the title of the current programme
  - **Next:** the start and end time and the title of the next programme (this is the new part)
- **Below the preview:** the next few programmes, each with its time, title and short description.
- **Remote:** OK on a channel previews it, and OK again opens the play menu, as now. Back returns to Screen 1, then to Home. Catch-up clocks, favourites and Report a problem stay as they are.

## Release
Build and release Android 3.14. It also includes the members-only announcement icon fix, which is waiting to ship.

## Technical details
- The work is in `MainActivity` for boxes with a smallest width of at least 600dp. The old browse layout is replaced with two new methods: `showLiveCategories()` (category list plus channel `GridView`) and `showLiveChannel(cat, idx)` (channel list, preview, Now/Next info panel, and a programme list from `GuideListings`). The phone path using `showTvGuide` is untouched.
- Now/Next comes from the existing cached `GuideListings` line-up: entry 0 is Now and entry 1 is Next, refreshing each minute.
- Each channel row's "on now" title loads lazily through the existing 3-at-a-time EPG fetch.
- Add tests for picking Now/Next from a line-up, including the end of a line-up, and for category stepping, beside the existing Android tests. Update the screen rule in the player AGENTS.md.

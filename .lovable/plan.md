# Fix the Live TV layout on boxes and the 📣 announcements icon

## Problems in the photo
- **Spacing:** the top half of the screen is mostly empty. The title, times, description and Next line are spread far apart, and the preview is too big, so only one guide row fits.
- **Duplicated date:** the date appears twice, once in red above the guide and again in the guide's own corner.
- **Announcements icon:** it sits on top of the Voice search button, and does the same over the buttons on the home screen.

## What changes
1. **Compact top area** (about a third of the screen, like your photo):
   - Shrink the preview so the guide gets the room. The family picture still fills the box.
   - Stack the programme details tightly from the top: title, then time + progress bar + minutes left, then the description (up to 3 lines), then "Next: … ☆ category".
   - Remove the red date line. The guide's own corner already shows the day, and that will now include the time ("Thu 5 Nov, 18:17").
2. **Guide gets the rest of the screen:** with the smaller top area, about 7–8 channels show, as in your photo.
3. **Announcements icon gets its own spot:**
   - On every screen, the top-right corner is kept free for the 📣 icon, so it never covers Search TV, Voice search or any home-screen button.
   - Restyle it to match the app's other buttons: same height and colours, a round button, and a small red number bubble for unread announcements instead of "📣 2" text.
4. Build and release Android 3.16.

Your message cut off at "and the homescree". I've taken that to mean the icon also covers buttons on the home screen. If you meant something else about the home screen, tell me and I'll add it.

## Technical details
- `showTvGuide` box path:
  - Set the top row and info column to `setBaselineAligned(false)` with top gravity; baseline alignment is what scattered the text.
  - Zero the vertical padding on the info texts.
  - Preview becomes about 30% of the screen width at 16:9, capped to 32% of the screen height.
  - Drop `dateLbl`, and give the date and time to the grid's corner label through a new `GuideGridView.setCornerText()`.
- Announcements icon (`PlayerApplication.showMajorIcon`):
  - A fixed 44dp circle using the app's CARD/ACCENT colours, with a separate red count badge.
  - Expose its reserved width as `MAJOR_ICON_SLOT` (about 64dp). MainActivity's header rows (`showHome`, `browse`, the guide pills row, search screens) add that much end padding while the app is unlocked.
- Update the matching rules in the player AGENTS.md, then run the Android checks. Sign 3.16 with the BM key, upload it, set it as current and verify the download.

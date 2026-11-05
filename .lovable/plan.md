# Fix the big gaps in the TV box Live TV info panel (right of the preview)

## What's wrong
Your photo shows the title, then a big empty space, the time, another big empty space, then the description. The "5 min left" text and the progress bar are missing too, even though BBC News at Six is on now.

The cause is the time line. It holds three things side by side: the time, the progress bar and "5 min left". The "min left" text gets squeezed to almost no width. It then wraps one letter per line into a tall, invisible column. That makes the whole time line very tall, and the time sits in the middle of it. That's where both gaps come from.

## The fix (TV boxes only, phones untouched)
- The panel on the right becomes a tight stack with no gaps, in this order:
  1. Search TV / Voice search pills (top right, as now)
  2. Programme title (bold, up to 2 lines)
  3. One line: `18:00 – 18:30  ·  5 min left`
  4. A thin progress bar right under it (only while the programme is on now)
  5. Description (up to 3 lines)
  6. `Next: 18:30 BBC London News` with the ☆ and category on the same line
- Every line in the panel is single-line or has a fixed line limit, so no line can stretch tall again.
- Each line keeps only a small gap (about 2–4dp) above and below.
- The preview size, the date row (◀ 24h / Now / 24h ▶), the guide grid, the Categories side tab and the 📣 icon stay as they are.

## Release
- Build Android 3.18, sign it with the BM key, upload it, set it as current and check the download matches.

## Technical details
- `MainActivity.showTvGuide` (boxLive branch): remove the `tr` row and the separate `boxLeft` TextView. Put "min left" or the duration into the `progTime` text.
- Add `boxBar` straight to `boxInfo` with fixed `LayoutParams(dp(160), dp(4))` and small top/bottom margins.
- Give `progTitle`, `progTime`, `boxDesc` and the `br` row explicit `WRAP_CONTENT` LayoutParams. Use `setIncludeFontPadding(false)`, 2–4dp vertical padding, and `setSingleLine` on `progTime`, `boxNext`, `boxStar` and `boxCat`.
- Update `onHighlight` to match: build the time string with the minutes-left suffix, and show or hide `boxBar`.
- Bump to versionCode 129 / versionName 3.18. Run the existing BM Player checks, then do the normal signed upload and set the build row as current.

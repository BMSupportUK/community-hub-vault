# Full-page Knowledge Base articles

## Changes
- Make each opened Knowledge Base article use the full available page width and height instead of the current narrow centred column.
- Keep the article text and media in a wide main column, with a dedicated ratings panel on the right on large screens.
- Move the overall rating and the member’s rating controls into that sidebar; place them naturally below the article heading on smaller screens.
- Make uploaded videos and embedded players display at their complete 16:9 size without clipping, while remaining contained on phones.
- Keep article editing, categories, searching, permissions, and rating behaviour unchanged.

## Checks
- Open an article containing a video and confirm the complete player and controls are visible and playback starts.
- Confirm the article fills the available Knowledge Base page on desktop and the ratings sidebar stays visible beside it.
- Confirm the article and ratings stack cleanly on a phone-sized screen.
- Confirm the app builds without errors.

## Technical details
- Update only the Knowledge Base article-reading layout and its rich-content media styling.
- Use the existing rating records and save action; no database changes are needed.

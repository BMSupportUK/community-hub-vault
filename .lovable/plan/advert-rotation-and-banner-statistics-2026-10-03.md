# Advert rotation and banner statistics

## Build
- Start every advert space on a random eligible banner, including the “Advertise here” artwork.
- Shuffle the full eligible set and show each advert once per cycle for the same 30-second period before reshuffling.
- Record a view whenever a banner becomes visible and record clicks against that exact banner.
- Reorganise the advert manager into separate Leaderboard, Skyscraper, Square, and “Advertise here” sections.
- Show all-time view and click totals directly beneath every saved banner and every custom “Advertise here” banner.

## Technical details
- Reuse the existing advert event table and statistics function, identifying each banner by its banner ID.
- Keep site and page-zone filtering unchanged, and never substitute a banner of the wrong shape.
- Verify the advert manager and live rotation at desktop and phone sizes.

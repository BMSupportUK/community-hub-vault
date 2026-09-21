# Fix the new-ticket screen layout and advert rail

## Changes
- Keep the new-ticket screen within the available height on large displays, with the form scrolling inside its panel instead of extending the page.
- Move the home icon from the left column into the top navigation row, immediately before the Welcome pill.
- Replace the former left home-icon area with the existing desktop-only vertical Google AdSense unit.
- Leave smaller screens and all ticket creation, messaging, and submission behaviour unchanged.

## Technical details
- Reuse the existing sidebar AdSense slot and viewport-fitting mode.
- Limit the height and overflow changes to the new-ticket view and its large-screen grid.

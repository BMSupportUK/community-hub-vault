# Fit the Knowledge Base to large screens

## Changes
- Keep the Knowledge Base inside the available screen height on large displays, with scrolling contained within the page rather than extending the whole app.
- Compact the large-screen Welcome layout and show the category cards in one row when space allows, so the full view fits without unnecessary overflow.
- Keep smaller-screen scrolling and all guide, category, rating, and editing behaviour unchanged.

## Technical details
- Give the Knowledge Base its own constrained scrolling area within the existing large-screen frame.
- Apply large-screen-only spacing, image-size, and category-grid adjustments.

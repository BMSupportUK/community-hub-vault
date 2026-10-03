# One-page scrolling Sports Guide events

## What will change

- Keep the guide controls, category, title, image, and notices fixed at the top of the guide screen.
- Replace the separate numbered event pages with one continuous event grid containing every event.
- Make only the events area scroll, so the fixed guide information remains visible.
- Preserve the existing event order, timezone conversion, expiry filtering, and “Back to guides” behaviour.

## Verification

- Open a guide containing enough events to exceed the screen height and confirm every event appears in one list.
- Scroll the events and confirm the top guide section does not move.
- Confirm there are no page numbers or previous/next page controls.
- Check the layout at the current 886×855 size and on a phone-sized screen.

## Technical detail

Remove the paginated grid state and controls from the member guide reader. Render the existing event HTML directly into the current responsive grid inside a bounded `overflow-y-auto` area, while keeping the surrounding article and header non-scrolling.

# Fit the ticket page and add a vertical advert

## Changes
- Keep the support-ticket workspace within the available height on large screens, with the ticket list and conversation scrolling inside their own areas instead of extending the whole page.
- Add the existing desktop-only vertical Google AdSense unit to the right of an open ticket.
- Preserve the order panel when a ticket is linked to an order, placing the advert alongside it without covering ticket content.
- Check the empty-ticket and open-ticket views at large desktop sizes and confirm smaller screens remain unchanged.

## Technical details
- Reuse the existing sidebar AdSense slot and its viewport-fitting mode.
- Adjust the large-screen ticket grid and minimum-height constraints only; do not change ticket messaging behavior.

# Remove the advert from the support ticket screens

## Changes
- Remove the vertical Google AdSense advert from the support ticket right-hand rail (the open-ticket conversation view, where the customer pays) — it is too tall and pushes the order/payment panel into a scroll.
- Remove the same advert from the new-ticket screen, which was added at the same time.
- Keep the linked order panel where a ticket has an order, letting it use the freed space so the order, payment steps and chat fit in full view without extra scrolling.
- Nothing else on the ticket screens changes: messaging, payments, and the advert elsewhere on the site are untouched.

## Technical details
- `src/routes/_authenticated/_approved/tickets.tsx`: delete the `AdSenseSlot slot="sidebar" fitViewport` blocks and their wrapper `min-h-[250px] flex-1` divs in the open-ticket rail (around line 2346) and the new-ticket aside (around line 590).
- The open-ticket rail keeps the linked order panel and expands to full width for it.
- Verify at desktop width that an open ticket with a linked order shows the order panel and conversation fully, with no scrollbar in the right rail.

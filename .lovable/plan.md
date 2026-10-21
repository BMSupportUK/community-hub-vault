# Tickets inside the Customer Portal

## What changes
- Add a **Tickets** tab to the Customer Portal tab bar, after My Orders: Shop, My Orders, Tickets, My Logins, Install Guides.
- The Tickets page keeps its current layout exactly. Only the portal tab bar is added on top, the same way Shop and Install Guides already work.
- For customers, **Tickets** comes out of the side rail so it isn't listed twice. Staff, management and admin keep Tickets in the side rail, because they work tickets from there.
- Old Tickets web addresses keep working.

## Stays the same
- Ticket chat, alerts, sounds, the `/video` command and who can see which ticket are not touched.

## Technical details
- `PortalTabs`: add a `"tickets"` tab linking to `/tickets`, detected by pathname.
- `tickets.tsx`: render `<PortalTabs active="tickets" />` above the existing layout for non-staff users only. This is a wrapper-only change, with no edits to the ticket thread code. Header collapse and viewport bounds stay as they are.
- `IconRail`: hide the Tickets entry when the user is a customer (no admin/management/staff/moderator role).
- Check: sign in as a customer and confirm the tab shows, a ticket opens and replies send. Sign in as staff and confirm the side rail is unchanged.

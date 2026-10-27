# Reset BM TV Enabler codes when a screen share ends

## What changes for people
- When a remote screen share ends (staff end it, or the last staff member leaves), the sharing reference used on that ticket or order stops working straight away.
- The ticket/order Remote setup goes back to step 1 and its ticks clear. The customer sees "Screen share ended — get a new reference in BM TV Enabler".
- In BM TV Enabler (phone and Windows), the saved reference is cleared and **New code** unlocks right away, so the customer doesn't wait out the 24 hours.
- The install reference and the customer's login PIN are left alone. Only the sharing reference resets.

## How it works
1. Database: when a screen-share session is marked ended, a new rule expires every sharing reference linked to that ticket/order and clears the ticket's setup state. This works the same way as the current "expire when ticket closes" rule.
2. Website: the customer and staff Remote setup screens notice the expired reference and go back to step 1 without a refresh, using the status checks they already run.
3. Apps: when the app checks a reference and the server says it was "ended by screen share", it forgets the reference and turns on New code. Both apps then need to be rebuilt and released.
4. Tests: one test checks that ending a session expires the sharing reference, and another checks that the install reference stays valid.

## Order of release
Release the apps first, then publish the website. That's the same order as before.

## Technical details
- Add an AFTER UPDATE trigger on the screen-share/TV session table for when `ended_at` goes from null to set. It expires `enabler_confirm_codes` where kind='share' and the bound ticket/order matches, and resets the ticket's remote setup row the way `reset_ticket_remote_setup` does. The locked video/session code is not touched; the trigger is database-only.
- The reference status endpoint returns `ended_by_share`. Phone `Enabler.java` and Windows `core.cjs` handle it by clearing the stored code and unlocking New code.

# Send the Enabler confirmation straight to the ticket or order

## What the customer sees
1. The customer opens Remote setup on their ticket or order and runs BM TV Enabler on the same home Wi-Fi.
2. When the TV check passes, the Remote setup page fills in by itself: the checks turn green and Connect appears. There's nothing to type.
3. If it can't match the two (for example, the ticket is open on mobile data), the page keeps the current "Type the code from BM TV Enabler" box as the fallback. The Enabler still shows its code.

## How the match works
- When a Remote setup page is open, it registers itself as waiting for a check, with the TV type and a hash of the home internet address. The registration lasts 2 hours.
- When the Enabler gets its confirmation code, the website looks for exactly one waiting ticket or order with the same home address and TV type that was opened in the last 2 hours. If it finds one, the code is applied there automatically, the same way as typing it, including the Helper connection code.
- If it finds none, or more than one, nothing happens automatically and the customer types the code.
- The page checks every few seconds while it's open, so the result shows without a refresh.

## Safety
- The match only happens when there's exactly one waiting page, the TV type matches, and the code is less than 2 hours old.
- The code is single-use, as it is now. Once it's applied, typing it again does nothing.
- Only a hash of the address is stored, never the address itself.

## Technical details
- New table `remote_setup_waiting` (ticket_id or order_id, device, ip_hash, expires_at, claimed_at). Staff can read it through RLS. Writes happen only through server functions and RPCs, and the grants are in the same migration.
- Ticket Remote setup gets an authenticated RPC to register as waiting. Order Remote setup gets a link+password server function, mirroring the existing redeem paths.
- `/api/public/enabler-confirm`: after it creates the code, it looks for a single matching waiting row and redeems the code into it with the existing ticket RPC or order redeem logic. Its response gains `linked: "ticket" | "order" | null`.
- Both Enablers show "Sent to your ticket/order automatically" when `linked` is set, and otherwise show the code as they do now. This needs a phone 1.23 and Windows 1.13 release. The website change works without an app update, because the server does the linking.
- Add tests: no link when there are zero or two matches or the TV type differs, one link for a single match, and an expired waiting row is ignored.
- The website changes need publishing.
